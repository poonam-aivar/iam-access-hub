import { PolicyStatement } from "@/types";
import { APP_CONFIG } from "@/config/accounts";

// ============================================================
// BLOCKED MANAGED POLICIES
// These can NEVER be requested, matched, or attached — regardless
// of who requests them or who approves them.
// ============================================================

export const BLOCKED_MANAGED_POLICIES: string[] = [
  "arn:aws:iam::aws:policy/AdministratorAccess",
  "arn:aws:iam::aws:policy/IAMFullAccess",
  "arn:aws:iam::aws:policy/PowerUserAccess",
  "arn:aws:iam::aws:policy/AWSOrganizationsFullAccess",
  "arn:aws:iam::aws:policy/AWSAccountManagementFullAccess",
  "arn:aws:iam::aws:policy/AWSKeyManagementServicePowerUser",
  "arn:aws:iam::aws:policy/AmazonS3FullAccess",
  "arn:aws:iam::aws:policy/AmazonEC2FullAccess",
  "arn:aws:iam::aws:policy/AmazonRDSFullAccess",
  "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
];

// ============================================================
// BLOCKED ACTIONS
// Claude cannot include these in any generated policy.
// The validator rejects any policy containing them.
// ============================================================

export const BLOCKED_ACTIONS: string[] = [
  // IAM — prevent privilege escalation
  "iam:CreateUser",
  "iam:DeleteUser",
  "iam:CreateRole",
  "iam:DeleteRole",
  "iam:AttachRolePolicy",
  "iam:DetachRolePolicy",
  "iam:PutRolePolicy",
  "iam:DeleteRolePolicy",
  "iam:AttachUserPolicy",
  "iam:PutUserPolicy",
  "iam:CreateAccessKey",
  "iam:UpdateLoginProfile",
  "iam:CreateLoginProfile",
  "iam:AddUserToGroup",
  "iam:CreatePolicyVersion",
  "iam:SetDefaultPolicyVersion",
  "iam:PassRole",

  // STS — prevent lateral movement
  "sts:AssumeRole",
  "sts:AssumeRoleWithSAML",
  "sts:AssumeRoleWithWebIdentity",

  // Organizations — no org-level changes
  "organizations:*",

  // Account — no account-level changes
  "account:*",

  // Destructive data operations
  "s3:DeleteBucket",
  "s3:PutBucketPolicy",
  "ec2:TerminateInstances",
  "rds:DeleteDBInstance",
  "rds:DeleteDBCluster",
  "dynamodb:DeleteTable",
  "lambda:DeleteFunction",

  // Security monitoring — cannot disable audit trail
  "cloudtrail:StopLogging",
  "cloudtrail:DeleteTrail",
  "cloudtrail:UpdateTrail",
  "guardduty:DeleteDetector",
  "guardduty:DisassociateFromMasterAccount",
  "config:StopConfigurationRecorder",
  "config:DeleteConfigurationRecorder",

  // Networking — prevent exfiltration paths
  "ec2:CreateVpcPeeringConnection",
  "ec2:AcceptVpcPeeringConnection",
  "ec2:AuthorizeSecurityGroupIngress",
  "ec2:ModifyInstanceAttribute",

  // KMS — prevent key deletion/modification
  "kms:ScheduleKeyDeletion",
  "kms:DisableKey",
  "kms:PutKeyPolicy",

  // SSO — portal should never modify SSO config
  "sso:*",
  "sso-admin:*",
  "identitystore:*",
];

// ============================================================
// BLOCKED PATTERNS
// Reject policies containing these dangerous patterns
// ============================================================

export const BLOCKED_RESOURCE_PATTERNS: string[] = [
  "*", // No wildcard resources
];

// ============================================================
// VALIDATORS
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a policy statement against all guardrails.
 * This runs BEFORE showing the policy to an approver and BEFORE attaching it.
 * Even if a human approves it, blocked actions/patterns are still rejected.
 */
export function validatePolicyStatements(
  statements: PolicyStatement[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (statements.length === 0) {
    errors.push("Policy must contain at least one statement");
    return { valid: false, errors, warnings };
  }

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const prefix = `Statement ${i + 1}`;

    // Must be Allow only (no Deny — we don't want users crafting complex deny logic)
    if (stmt.Effect !== "Allow") {
      errors.push(`${prefix}: Only "Allow" effect is permitted`);
    }

    // Check for wildcard actions
    if (stmt.Action.includes("*")) {
      errors.push(`${prefix}: Wildcard action "*" is blocked`);
    }

    // Check for blocked actions
    for (const action of stmt.Action) {
      const isBlocked = BLOCKED_ACTIONS.some((blocked) => {
        if (blocked.endsWith("*")) {
          const prefix = blocked.slice(0, -1);
          return action.startsWith(prefix) || action === blocked;
        }
        return action === blocked;
      });

      if (isBlocked) {
        errors.push(`${prefix}: Action "${action}" is blocked by security policy`);
      }

      // Check for service-level wildcards (e.g., "s3:*")
      if (action.endsWith(":*")) {
        errors.push(
          `${prefix}: Service-level wildcard "${action}" is not allowed. Specify exact actions.`
        );
      }
    }

    // Check for wildcard resources
    if (stmt.Resource.includes("*")) {
      errors.push(
        `${prefix}: Wildcard resource "*" is blocked. Specify exact ARNs.`
      );
    }

    // Check action count limit
    if (stmt.Action.length > APP_CONFIG.maxPolicyActions) {
      errors.push(
        `${prefix}: Too many actions (${stmt.Action.length}). Maximum is ${APP_CONFIG.maxPolicyActions}.`
      );
    }

    // Check resource count limit
    if (stmt.Resource.length > APP_CONFIG.maxPolicyResources) {
      errors.push(
        `${prefix}: Too many resources (${stmt.Resource.length}). Maximum is ${APP_CONFIG.maxPolicyResources}.`
      );
    }

    // Warn on broad resource patterns
    for (const resource of stmt.Resource) {
      if (resource.includes("*") && !resource.includes(":function:")) {
        warnings.push(
          `${prefix}: Resource "${resource}" contains a wildcard — verify this is scoped correctly`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates that a task description doesn't contain prompt injection attempts
 */
export function sanitizeTaskDescription(input: string): {
  sanitized: string;
  suspicious: boolean;
} {
  const suspiciousPatterns = [
    /ignore\s+(previous|above|all)\s+(instructions|prompts)/i,
    /you\s+are\s+(now|a|an)/i,
    /system\s*:\s*/i,
    /\bpretend\b/i,
    /override\s+(security|guardrail|policy)/i,
    /\badministrator\s*access\b/i,
    /\bfull\s*access\b/i,
    /\b\*:\*\b/,
    /\bAction\s*:\s*"\*"/i,
    /\bResource\s*:\s*"\*"/i,
  ];

  let suspicious = false;
  let sanitized = input;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      suspicious = true;
      break;
    }
  }

  // Strip any JSON-like content that might be trying to inject policy directly
  sanitized = sanitized.replace(/\{[\s\S]*?"Effect"[\s\S]*?\}/g, "[REMOVED]");

  // Limit length
  sanitized = sanitized.slice(0, 500);

  return { sanitized, suspicious };
}

/**
 * Checks if a managed policy ARN is blocked
 */
export function isManagedPolicyBlocked(policyArn: string): boolean {
  return BLOCKED_MANAGED_POLICIES.includes(policyArn);
}

/**
 * Validates session duration is within allowed limits
 */
export function validateSessionDuration(hours: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (hours <= 0) {
    errors.push("Duration must be greater than 0");
  }
  if (hours > APP_CONFIG.maxSessionDurationHours) {
    errors.push(
      `Duration ${hours}h exceeds maximum of ${APP_CONFIG.maxSessionDurationHours}h`
    );
  }
  if (hours > 2) {
    warnings.push("Sessions longer than 2 hours should have strong justification");
  }

  return { valid: errors.length === 0, errors, warnings };
}
