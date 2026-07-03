/**
 * Session Cleanup Lambda
 *
 * Runs every 5 minutes via EventBridge. Scans for expired sessions and:
 * 1. Deletes the IAM role + inline policy created for Lane B sessions
 * 2. Removes the session record from DynamoDB
 * 3. Logs the cleanup action
 */

const {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  IAMClient,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  ListRolePoliciesCommand,
  GetRoleCommand,
} = require("@aws-sdk/client-iam");

const ddb = new DynamoDBClient({});
const iam = new IAMClient({});

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const ROLE_PREFIX = process.env.ROLE_PREFIX || "IAMAccessHub-";

exports.handler = async (event) => {
  console.log("Starting session cleanup...");

  const now = new Date().toISOString();

  // Find expired sessions
  // Note: In production with higher volume, use a GSI query instead of scan
  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: SESSIONS_TABLE,
      FilterExpression: "expiresAt < :now",
      ExpressionAttributeValues: {
        ":now": { S: now },
      },
    })
  );

  const expiredSessions = scanResult.Items || [];
  console.log(`Found ${expiredSessions.length} expired sessions`);

  let cleaned = 0;
  let errors = 0;

  for (const session of expiredSessions) {
    const sessionId = session.sessionId.S;
    const roleName = session.roleName?.S;
    const lane = session.lane?.S;

    try {
      // Only Lane B sessions have IAM roles to clean up
      if (lane === "lane-b" && roleName && roleName.startsWith(ROLE_PREFIX)) {
        await cleanupRole(roleName);
      }

      // Delete session record from DynamoDB
      await ddb.send(
        new DeleteItemCommand({
          TableName: SESSIONS_TABLE,
          Key: { sessionId: { S: sessionId } },
        })
      );

      cleaned++;
      console.log(`Cleaned session: ${sessionId} (role: ${roleName || "none"})`);
    } catch (error) {
      errors++;
      console.error(`Failed to clean session ${sessionId}:`, error.message);
    }
  }

  console.log(
    `Cleanup complete: ${cleaned} cleaned, ${errors} errors, ${expiredSessions.length} total`
  );

  return {
    cleaned,
    errors,
    total: expiredSessions.length,
  };
};

async function cleanupRole(roleName) {
  // Check if role exists
  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
  } catch (error) {
    if (error.name === "NoSuchEntityException") {
      console.log(`Role ${roleName} already deleted, skipping`);
      return;
    }
    throw error;
  }

  // Delete all inline policies first
  const policies = await iam.send(
    new ListRolePoliciesCommand({ RoleName: roleName })
  );

  for (const policyName of policies.PolicyNames || []) {
    await iam.send(
      new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
      })
    );
  }

  // Delete the role
  await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
  console.log(`Deleted IAM role: ${roleName}`);
}
