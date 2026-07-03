import { AwsAccount } from "@/types";

/**
 * V1 Account Registry
 *
 * These are the 10 AWS accounts in scope for the initial release.
 * Account IDs should be populated from SSM Parameter Store in production.
 * The values below are placeholders — replace with actual account IDs.
 */
export const V1_ACCOUNTS: AwsAccount[] = [
  {
    accountId: "PLACEHOLDER",
    accountName: "Agentic-Polo",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Agentic-Systems",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Aivar Agents",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Aivar Convogent.dev",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Aivar Velogent.dev",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Chatbots",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Cloud Migration",
    environment: "staging",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Cloud Modernization",
    environment: "staging",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "Document Extraction",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
  {
    accountId: "PLACEHOLDER",
    accountName: "mlops",
    environment: "development",
    permissionSets: [],
    laneBEnabled: true,
  },
];

/**
 * App-wide configuration constants
 */
export const APP_CONFIG = {
  /** Maximum session duration in hours */
  maxSessionDurationHours: 4,
  /** Default session duration in hours */
  defaultSessionDurationHours: 1,
  /** Maximum concurrent active sessions per user */
  maxConcurrentSessions: 2,
  /** Maximum credential requests per user per hour */
  maxRequestsPerHour: 5,
  /** Hours before an unapproved request auto-expires */
  requestExpiryHours: 24,
  /** Maximum IAM actions allowed in a generated policy */
  maxPolicyActions: 10,
  /** Maximum resources allowed in a generated policy */
  maxPolicyResources: 5,
  /** AWS region */
  region: process.env.AWS_REGION || "ap-south-1",
  /** Bedrock model for policy generation */
  bedrockModelId:
    process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
} as const;
