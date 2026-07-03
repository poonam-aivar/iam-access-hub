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

// ============================================================
// Mandatory tags — applied to ALL resources in ALL stacks
// ============================================================
const TAGS = {
  project: "iam-access-hub",
  purpose: "warpspeed",
  owner: "poonam-aivar",
};

// Database tables
const dbStack = new DatabaseStack(app, "IAMAccessHub-Database", { env });

// Session cleanup (Lambda + EventBridge)
const cleanupStack = new CleanupStack(app, "IAMAccessHub-Cleanup", {
  env,
  sessionsTable: dbStack.sessionsTable,
});

// Portal execution role (IAM)
const portalRoleStack = new PortalRoleStack(app, "IAMAccessHub-PortalRole", {
  env,
  requestsTable: dbStack.requestsTable,
  policyLibraryTable: dbStack.policyLibraryTable,
  sessionsTable: dbStack.sessionsTable,
  auditLogsTable: dbStack.auditLogsTable,
});

// Apply tags to all stacks
for (const [key, value] of Object.entries(TAGS)) {
  cdk.Tags.of(app).add(key, value);
}

app.synth();
