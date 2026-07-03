import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * Database Stack — DynamoDB tables for IAM Access Hub
 *
 * Tables:
 * 1. Requests — Lane B access requests
 * 2. PolicyLibrary — Reusable IAM policies
 * 3. Sessions — Active sessions (both lanes)
 * 4. AuditLogs — Complete audit trail
 *
 * All tables use on-demand billing (PAY_PER_REQUEST) to stay within free tier
 * at low usage volumes and avoid provisioned capacity costs.
 */
export class DatabaseStack extends cdk.Stack {
  public readonly requestsTable: dynamodb.Table;
  public readonly policyLibraryTable: dynamodb.Table;
  public readonly sessionsTable: dynamodb.Table;
  public readonly auditLogsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // ACCESS REQUESTS TABLE
    // PK: requestId
    // GSI1: status + createdAt (for approval queue)
    // GSI2: userId + createdAt (for user's own requests)
    // ============================================================
    this.requestsTable = new dynamodb.Table(this, "RequestsTable", {
      tableName: "IAMAccessHub-Requests",
      partitionKey: { name: "requestId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.requestsTable.addGlobalSecondaryIndex({
      indexName: "status-createdAt-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.requestsTable.addGlobalSecondaryIndex({
      indexName: "userId-createdAt-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // POLICY LIBRARY TABLE
    // PK: policyId
    // GSI1: partitionKey (POLICY) + timesUsed (for ordering by popularity)
    // ============================================================
    this.policyLibraryTable = new dynamodb.Table(this, "PolicyLibraryTable", {
      tableName: "IAMAccessHub-PolicyLibrary",
      partitionKey: { name: "policyId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.policyLibraryTable.addGlobalSecondaryIndex({
      indexName: "timesUsed-index",
      partitionKey: {
        name: "partitionKey",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "timesUsed", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // SESSIONS TABLE
    // PK: sessionId
    // GSI1: userId + expiresAt (for user's active sessions)
    // GSI2: partitionKey (SESSION) + expiresAt (for all active)
    // TTL: auto-delete expired sessions
    // ============================================================
    this.sessionsTable = new dynamodb.Table(this, "SessionsTable", {
      tableName: "IAMAccessHub-Sessions",
      partitionKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Sessions are ephemeral
    });

    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: "userId-expiresAt-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "expiresAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: "expiresAt-index",
      partitionKey: {
        name: "partitionKey",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "expiresAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // AUDIT LOGS TABLE
    // PK: logId
    // GSI1: userId + timestamp
    // GSI2: accountId + timestamp
    // GSI3: partitionKey (LOG) + timestamp (for all logs)
    // TTL: 90-day retention
    // ============================================================
    this.auditLogsTable = new dynamodb.Table(this, "AuditLogsTable", {
      tableName: "IAMAccessHub-AuditLogs",
      partitionKey: { name: "logId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.auditLogsTable.addGlobalSecondaryIndex({
      indexName: "userId-timestamp-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.auditLogsTable.addGlobalSecondaryIndex({
      indexName: "accountId-timestamp-index",
      partitionKey: { name: "accountId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.auditLogsTable.addGlobalSecondaryIndex({
      indexName: "partitionKey-timestamp-index",
      partitionKey: {
        name: "partitionKey",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // OUTPUTS
    // ============================================================
    new cdk.CfnOutput(this, "RequestsTableName", {
      value: this.requestsTable.tableName,
    });
    new cdk.CfnOutput(this, "PolicyLibraryTableName", {
      value: this.policyLibraryTable.tableName,
    });
    new cdk.CfnOutput(this, "SessionsTableName", {
      value: this.sessionsTable.tableName,
    });
    new cdk.CfnOutput(this, "AuditLogsTableName", {
      value: this.auditLogsTable.tableName,
    });
  }
}
