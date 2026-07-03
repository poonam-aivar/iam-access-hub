import {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  GetRoleCommand,
} from "@aws-sdk/client-iam";
import { APP_CONFIG } from "@/config/accounts";
import { PolicyStatement } from "@/types";

const iamClient = new IAMClient({ region: APP_CONFIG.region });

const ROLE_PREFIX = "IAMAccessHub-";

/**
 * Trust policy allowing the portal's role to assume the created role.
 * The portal's own role ARN should come from config/env.
 */
function buildTrustPolicy(portalRoleArn: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: portalRoleArn,
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": "iam-access-hub",
          },
        },
      },
    ],
  });
}

/**
 * Creates a short-lived IAM role for a Lane B request.
 * The role is tagged for easy identification and cleanup.
 */
export async function createSessionRole(params: {
  requestId: string;
  accountId: string;
  portalRoleArn: string;
  maxSessionDuration: number;
}): Promise<string> {
  const roleName = `${ROLE_PREFIX}${params.requestId}`;

  const command = new CreateRoleCommand({
    RoleName: roleName,
    AssumeRolePolicyDocument: buildTrustPolicy(params.portalRoleArn),
    Description: `Temporary role for IAM Access Hub request ${params.requestId}`,
    MaxSessionDuration: params.maxSessionDuration,
    Tags: [
      { Key: "project", Value: "iam-access-hub" },
      { Key: "purpose", Value: "warpspeed" },
      { Key: "owner", Value: "poonam-aivar" },
      { Key: "ManagedBy", Value: "iam-access-hub" },
      { Key: "RequestId", Value: params.requestId },
      { Key: "AutoCleanup", Value: "true" },
    ],
  });

  const response = await iamClient.send(command);
  return response.Role!.Arn!;
}

/**
 * Attaches an inline policy to a session role.
 * The policy has already been validated by guardrails before reaching here.
 */
export async function attachSessionPolicy(params: {
  roleName: string;
  policyName: string;
  statements: PolicyStatement[];
}): Promise<void> {
  const policyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: params.statements,
  });

  const command = new PutRolePolicyCommand({
    RoleName: params.roleName,
    PolicyName: params.policyName,
    PolicyDocument: policyDocument,
  });

  await iamClient.send(command);
}

/**
 * Cleans up a session role and its inline policies.
 * Called by the cleanup Lambda when a session expires.
 */
export async function deleteSessionRole(roleName: string): Promise<void> {
  // First delete the inline policy
  try {
    await iamClient.send(
      new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "session-policy",
      })
    );
  } catch (error) {
    // Policy may already be deleted — continue
  }

  // Then delete the role
  await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
}

/**
 * Checks if a session role exists (for cleanup verification)
 */
export async function roleExists(roleName: string): Promise<boolean> {
  try {
    await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    return true;
  } catch (error: any) {
    if (error.name === "NoSuchEntityException") {
      return false;
    }
    throw error;
  }
}

export { iamClient, ROLE_PREFIX };
