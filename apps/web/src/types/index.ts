// ============================================================
// IAM Access Hub — Core Types
// ============================================================

/** Supported access lanes */
export type AccessLane = "lane-a" | "lane-b";

/** Request status lifecycle */
export type RequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "active"
  | "expired"
  | "revoked";

/** User role within the portal */
export type UserRole = "user" | "devops" | "admin";

// ============================================================
// Account Registry
// ============================================================

export interface AwsAccount {
  accountId: string;
  accountName: string;
  environment: "production" | "staging" | "development";
  /** Permission sets available for Lane A (SSO users) */
  permissionSets: PermissionSet[];
  /** Whether Lane B (non-SSO) requests are allowed for this account */
  laneBEnabled: boolean;
}

export interface PermissionSet {
  arn: string;
  name: string;
  description: string;
}

// ============================================================
// Access Request (Lane B)
// ============================================================

export interface AccessRequest {
  requestId: string;
  userId: string;
  userEmail: string;
  userName: string;
  accountId: string;
  accountName: string;
  taskDescription: string;
  justification: string;
  requestedDurationHours: number;
  /** The policy that was matched or generated */
  policy: GeneratedPolicy | null;
  status: RequestStatus;
  /** DevOps team member who approved/denied */
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** STS session details (populated after approval) */
  session: SessionCredentials | null;
}

// ============================================================
// Policy
// ============================================================

export interface PolicyStatement {
  Effect: "Allow";
  Action: string[];
  Resource: string[];
  Condition?: Record<string, Record<string, string>>;
}

export interface GeneratedPolicy {
  /** Whether this was matched from library or newly generated */
  source: "matched" | "generated";
  /** If matched, the library policy ID */
  matchedPolicyId?: string;
  name: string;
  description: string;
  statements: PolicyStatement[];
}

export interface PolicyLibraryEntry {
  policyId: string;
  name: string;
  description: string;
  statements: PolicyStatement[];
  /** Task descriptions this policy has been used for */
  usedForTasks: string[];
  timesUsed: number;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string;
}

// ============================================================
// Session / Credentials
// ============================================================

export interface SessionCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
  consoleUrl: string;
  region: string;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  userEmail: string;
  lane: AccessLane;
  accountId: string;
  accountName: string;
  roleName: string;
  createdAt: string;
  expiresAt: string;
  /** For Lane B: the request that spawned this session */
  requestId?: string;
}

// ============================================================
// Audit Log
// ============================================================

export interface AuditLogEntry {
  logId: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  lane: AccessLane;
  accountId: string;
  accountName: string;
  metadata: Record<string, string>;
  ipAddress: string;
  userAgent: string;
}

export type AuditAction =
  | "session_created"
  | "session_expired"
  | "session_revoked"
  | "request_submitted"
  | "request_approved"
  | "request_denied"
  | "policy_generated"
  | "policy_matched"
  | "credentials_vended"
  | "login"
  | "logout";

// ============================================================
// Auth / User
// ============================================================

export interface PortalUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  /** Whether user has SSO access (Lane A eligible) */
  isSsoUser: boolean;
  /** Accounts user has SSO access to */
  ssoAccounts: string[];
  lastLoginAt: string;
  createdAt: string;
}
