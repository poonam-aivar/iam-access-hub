import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequest, getRequestsByUser, getActiveSessions } from "@/lib/db";
import { generatePolicy, matchPolicy } from "@/lib/aws/bedrock";
import { getAllPolicies } from "@/lib/db";
import {
  validateSessionDuration,
  sanitizeTaskDescription,
} from "@/lib/guardrails";
import { APP_CONFIG, V1_ACCOUNTS } from "@/config/accounts";
import { AccessRequest } from "@/types";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
  generateId,
  audit,
} from "@/lib/api-helpers";

const requestSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  taskDescription: z
    .string()
    .min(20, "Task description must be at least 20 characters")
    .max(500, "Task description must be under 500 characters"),
  justification: z
    .string()
    .min(10, "Justification must be at least 10 characters")
    .max(300, "Justification must be under 300 characters"),
  durationHours: z.number().min(1).max(APP_CONFIG.maxSessionDurationHours),
});

/**
 * POST /api/requests
 *
 * Lane B: Submit an access request.
 * The AI engine (Bedrock Claude) will attempt to match an existing policy
 * or generate a new least-privilege policy. The request then goes to
 * the DevOps approval queue.
 *
 * GET /api/requests
 *
 * List requests — user sees their own, admins see all pending.
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  // 2. Parse & validate input
  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await request.json();
    body = requestSchema.parse(raw);
  } catch (error: any) {
    const message =
      error?.issues?.[0]?.message || "Invalid request body";
    return errorResponse(message, 400);
  }

  // 3. Validate session duration
  const durationValidation = validateSessionDuration(body.durationHours);
  if (!durationValidation.valid) {
    return errorResponse(durationValidation.errors.join("; "), 400);
  }

  // 4. Check account is in V1 scope and Lane B is enabled
  const account = V1_ACCOUNTS.find((a) => a.accountId === body.accountId);
  if (!account) {
    return errorResponse("Account not found or not in scope", 404);
  }
  if (!account.laneBEnabled) {
    return errorResponse("Lane B is not enabled for this account", 403);
  }

  // 5. Rate limit: max requests per hour
  const userRequests = await getRequestsByUser(session.user.id);
  const recentRequests = userRequests.filter((r) => {
    const createdAt = new Date(r.createdAt).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return createdAt > oneHourAgo;
  });
  if (recentRequests.length >= APP_CONFIG.maxRequestsPerHour) {
    return errorResponse(
      `Rate limit: maximum ${APP_CONFIG.maxRequestsPerHour} requests per hour`,
      429
    );
  }

  // 6. Sanitize task description (prompt injection check)
  const { sanitized, suspicious } = sanitizeTaskDescription(body.taskDescription);
  if (suspicious) {
    await audit({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "request_submitted",
      lane: "lane-b",
      accountId: body.accountId,
      accountName: account.accountName,
      metadata: { flagged: "suspicious_input", original: body.taskDescription },
      request,
    });
    return errorResponse(
      "Your task description was flagged as suspicious. Please describe your task in plain language without including policy syntax or special instructions.",
      400
    );
  }

  // 7. AI Policy Engine: match or generate
  let policy = null;
  let policySource: "matched" | "generated" = "generated";

  try {
    // First try to match against existing library
    const policyLibrary = await getAllPolicies();
    const matched = await matchPolicy(sanitized, policyLibrary);

    if (matched) {
      policy = {
        source: "matched" as const,
        matchedPolicyId: matched.policyId,
        name: matched.name,
        description: matched.description,
        statements: matched.statements,
      };
      policySource = "matched";
    } else {
      // Generate new policy
      const generated = await generatePolicy(
        sanitized,
        body.accountId,
        APP_CONFIG.region
      );

      if (generated.error) {
        return errorResponse(
          `Policy generation failed: ${generated.error}`,
          422
        );
      }

      policy = generated.policy;
      policySource = "generated";
    }
  } catch (error) {
    console.error("AI policy engine error:", error);
    return errorResponse(
      "Failed to generate policy. Please try again or contact DevOps.",
      500
    );
  }

  // 8. Create the request record
  const requestId = generateId();
  const accessRequest: AccessRequest = {
    requestId,
    userId: session.user.id,
    userEmail: session.user.email!,
    userName: session.user.name || session.user.email!,
    accountId: body.accountId,
    accountName: account.accountName,
    taskDescription: sanitized,
    justification: body.justification,
    requestedDurationHours: body.durationHours,
    policy,
    status: "pending",
    reviewedBy: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    session: null,
  };

  await createRequest(accessRequest);

  // 9. Audit log
  await audit({
    userId: session.user.id,
    userEmail: session.user.email!,
    action: "request_submitted",
    lane: "lane-b",
    accountId: body.accountId,
    accountName: account.accountName,
    metadata: {
      requestId,
      policySource,
      policyName: policy?.name || "none",
    },
    request,
  });

  // 10. Return the request with generated/matched policy
  return successResponse(
    {
      requestId,
      status: "pending",
      policy,
      message:
        policySource === "matched"
          ? "Matched an existing policy from the library. Sent to DevOps for approval."
          : "Generated a new least-privilege policy. Sent to DevOps for approval.",
    },
    201
  );
}

/**
 * GET /api/requests
 *
 * Lists requests:
 * - Regular users see only their own requests
 * - DevOps/Admin users see all pending requests + their own
 */
export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  // For now, return user's own requests
  // TODO: Add role-based access — DevOps sees pending queue
  const requests = await getRequestsByUser(session.user.id);

  const filtered = status
    ? requests.filter((r) => r.status === status)
    : requests;

  return successResponse({ requests: filtered });
}
