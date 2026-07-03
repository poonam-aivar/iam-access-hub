import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { APP_CONFIG } from "@/config/accounts";
import {
  AccessRequest,
  PolicyLibraryEntry,
  AuditLogEntry,
  ActiveSession,
} from "@/types";

const ddbClient = new DynamoDBClient({ region: APP_CONFIG.region });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Table names
const TABLES = {
  requests: "IAMAccessHub-Requests",
  policyLibrary: "IAMAccessHub-PolicyLibrary",
  auditLogs: "IAMAccessHub-AuditLogs",
  sessions: "IAMAccessHub-Sessions",
} as const;

// ============================================================
// ACCESS REQUESTS (Lane B)
// ============================================================

export async function createRequest(request: AccessRequest): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLES.requests,
      Item: request,
      ConditionExpression: "attribute_not_exists(requestId)",
    })
  );
}

export async function getRequest(
  requestId: string
): Promise<AccessRequest | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.requests,
      Key: { requestId },
    })
  );
  return (result.Item as AccessRequest) || null;
}

export async function getRequestsByStatus(
  status: string
): Promise<AccessRequest[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.requests,
      IndexName: "status-createdAt-index",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status },
      ScanIndexForward: false, // newest first
    })
  );
  return (result.Items as AccessRequest[]) || [];
}

export async function getRequestsByUser(
  userId: string
): Promise<AccessRequest[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.requests,
      IndexName: "userId-createdAt-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
      ScanIndexForward: false,
    })
  );
  return (result.Items as AccessRequest[]) || [];
}

export async function updateRequestStatus(
  requestId: string,
  status: string,
  reviewedBy?: string,
  reviewNote?: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.requests,
      Key: { requestId },
      UpdateExpression:
        "SET #status = :status, reviewedBy = :reviewedBy, reviewNote = :reviewNote, reviewedAt = :reviewedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":reviewedBy": reviewedBy || null,
        ":reviewNote": reviewNote || null,
        ":reviewedAt": new Date().toISOString(),
      },
    })
  );
}

// ============================================================
// POLICY LIBRARY
// ============================================================

export async function savePolicy(policy: PolicyLibraryEntry): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLES.policyLibrary,
      Item: policy,
    })
  );
}

export async function getPolicy(
  policyId: string
): Promise<PolicyLibraryEntry | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.policyLibrary,
      Key: { policyId },
    })
  );
  return (result.Item as PolicyLibraryEntry) || null;
}

export async function getAllPolicies(): Promise<PolicyLibraryEntry[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.policyLibrary,
      IndexName: "timesUsed-index",
      KeyConditionExpression: "partitionKey = :pk",
      ExpressionAttributeValues: { ":pk": "POLICY" },
      ScanIndexForward: false, // most used first
    })
  );
  return (result.Items as PolicyLibraryEntry[]) || [];
}

export async function incrementPolicyUsage(
  policyId: string,
  taskDescription: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.policyLibrary,
      Key: { policyId },
      UpdateExpression:
        "SET timesUsed = timesUsed + :one, lastUsedAt = :now ADD usedForTasks :task",
      ExpressionAttributeValues: {
        ":one": 1,
        ":now": new Date().toISOString(),
        ":task": new Set([taskDescription]),
      },
    })
  );
}

// ============================================================
// ACTIVE SESSIONS
// ============================================================

export async function createSession(session: ActiveSession): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLES.sessions,
      Item: {
        ...session,
        ttl: Math.floor(new Date(session.expiresAt).getTime() / 1000),
      },
    })
  );
}

export async function getActiveSessions(
  userId: string
): Promise<ActiveSession[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      IndexName: "userId-expiresAt-index",
      KeyConditionExpression: "userId = :userId AND expiresAt > :now",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":now": new Date().toISOString(),
      },
    })
  );
  return (result.Items as ActiveSession[]) || [];
}

export async function getAllActiveSessions(): Promise<ActiveSession[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      IndexName: "expiresAt-index",
      KeyConditionExpression: "partitionKey = :pk AND expiresAt > :now",
      ExpressionAttributeValues: {
        ":pk": "SESSION",
        ":now": new Date().toISOString(),
      },
    })
  );
  return (result.Items as ActiveSession[]) || [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.sessions,
      Key: { sessionId },
    })
  );
}

// ============================================================
// AUDIT LOGS
// ============================================================

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLES.auditLogs,
      Item: {
        ...entry,
        // TTL: keep audit logs for 90 days
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      },
    })
  );
}

export async function queryAuditLogs(params: {
  userId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  let keyCondition: string;
  let expressionValues: Record<string, any>;

  if (params.userId) {
    keyCondition = "userId = :userId";
    expressionValues = { ":userId": params.userId };
  } else if (params.accountId) {
    keyCondition = "accountId = :accountId";
    expressionValues = { ":accountId": params.accountId };
  } else {
    keyCondition = "partitionKey = :pk";
    expressionValues = { ":pk": "LOG" };
  }

  if (params.startDate) {
    keyCondition += " AND #ts >= :start";
    expressionValues[":start"] = params.startDate;
  }
  if (params.endDate) {
    keyCondition += " AND #ts <= :end";
    expressionValues[":end"] = params.endDate;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.auditLogs,
      IndexName: params.userId
        ? "userId-timestamp-index"
        : params.accountId
          ? "accountId-timestamp-index"
          : "partitionKey-timestamp-index",
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames:
        params.startDate || params.endDate ? { "#ts": "timestamp" } : undefined,
      ExpressionAttributeValues: expressionValues,
      ScanIndexForward: false,
      Limit: params.limit || 50,
    })
  );
  return (result.Items as AuditLogEntry[]) || [];
}

export { docClient, TABLES };
