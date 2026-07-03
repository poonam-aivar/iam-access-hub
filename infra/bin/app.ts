#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DatabaseStack } from "../lib/database-stack";
import { CleanupStack } from "../lib/cleanup-stack";
import { PortalRoleStack } from "../lib/portal-role-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "ap-south-1",
};

// Database tables
const dbStack = new DatabaseStack(app, "IAMAccessHub-Database", { env });

// Session cleanup (Lambda + EventBridge)
new CleanupStack(app, "IAMAccessHub-Cleanup", {
  env,
  sessionsTable: dbStack.sessionsTable,
});

// Portal execution role (IAM)
new PortalRoleStack(app, "IAMAccessHub-PortalRole", {
  env,
  requestsTable: dbStack.requestsTable,
  policyLibraryTable: dbStack.policyLibraryTable,
  sessionsTable: dbStack.sessionsTable,
  auditLogsTable: dbStack.auditLogsTable,
});

app.synth();
