import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getRequest,
  updateRequestStatus,
  createSession,
  savePolicy,
  incrementPolicyUsage,
} from "@/lib/db";
import { createSessionRole, attachSessionPolicy } from "@/lib/aws/iam";
import { assumeRole } from "@/lib/aws/sts";
import { validatePolicyStatements } from "@/lib/guardrails";
import { APP_CONFIG } from "@/config/accounts";
import { PolicyLibraryEntry } from "@/types";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
  generateId,
  audit,
} from "@/lib/api-helpers";

const approveSchema = z.object({
  note: z.string().max(500).optional(),
});

/**
 * POST /api/requests/[id]/approve
 *
 * DevOps approves a pending Lane B request.
 * This triggers:
 * 1. Re-validate the policy against guardrails (defence in depth)
 * 2. Create a temporary IAM role
 * 3. Attach the approved policy
 * 4. AssumeRole to generate temporary credentials
 * 5. Save the policy to the library (if newly generated)
 * 6. Return credentials to the requester
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Authenticate — must be DevOps/Admin
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  // 2. Parse body
  let body: z.infer<typeof approveSchema>;
  try {
    const raw = await request.json();
    body = approveSchema.parse(raw);
  } catch {
    body = { note: undefined };
  }

  // 3. Get the request
  const accessRequest = await getRequest(params.id);
  if (!accessRequest) {
    return errorResponse("Request not found", 404);
  }

  // 4. Check request is pending
  if (accessRequest.status !== "pending") {
    return errorResponse(
      `Request is already ${accessRequest.status}`,
      409
    );
  }

  // 5. Self-approval check — requester cannot approve their own request
  if (accessRequest.userId === session.user.id) {
    return errorResponse(
      "You cannot approve your own request",
      403
    );
  }

  // 6. Re-validate the policy against guardrails (defence in depth)
  if (!accessRequest.policy || !accessRequest.policy.statements) {
    return errorResponse("Request has no policy to approve", 422);
  }

  const validation = validatePolicyStatements(accessRequest.policy.statements);
  if (!validation.valid) {
    return errorResponse(
      `Policy failed security validation: ${validation.errors.join("; ")}`,
      422
    );
  }

  try {
    // 7. Create temporary IAM role
    const portalRoleArn = process.env.PORTAL_ROLE_ARN!;
    const durationSeconds = accessRequest.requestedDurationHours * 3600;

    const roleArn = await createSessionRole({
      requestId: accessRequest.requestId,
      accountId: accessRequest.accountId,
      portalRoleArn,
      maxSessionDuration: durationSeconds,
    });

    const roleName = `IAMAccessHub-${accessRequest.requestId}`;

    // 8. Attach the approved policy
    await attachSessionPolicy({
      roleName,
      policyName: "session-policy",
      statements: accessRequest.policy.statements,
    });

    // 9. Assume the role to get credentials
    const credentials = await assumeRole({
      roleArn,
      sessionName: `hub-${accessRequest.userId.substring(0, 20)}`,
      durationSeconds,
      externalId: "iam-access-hub",
    });

    // 10. Build console URL
    const consoleUrl = buildConsoleUrl(credentials);

    // 11. Calculate expiry
    const expiresAt = credentials.expiration.toISOString();

    // 12. Record the session
    const sessionId = generateId();
    await createSession({
      sessionId,
      userId: accessRequest.userId,
      userEmail: accessRequest.userEmail,
      lane: "lane-b",
      accountId: accessRequest.accountId,
      accountName: accessRequest.accountName,
      roleName,
      createdAt: new Date().toISOString(),
      expiresAt,
      requestId: accessRequest.requestId,
    });

    // 13. Update request status
    await updateRequestStatus(
      accessRequest.requestId,
      "approved",
      session.user.email!,
      body.note || undefined
    );

    // 14. Save policy to library (if newly generated)
    if (accessRequest.policy.source === "generated") {
      const policyEntry: PolicyLibraryEntry = {
        policyId: generateId(),
        name: accessRequest.policy.name,
        description: accessRequest.policy.description,
        statements: accessRequest.policy.statements,
        usedForTasks: [accessRequest.taskDescription],
        timesUsed: 1,
        createdAt: new Date().toISOString(),
        createdBy: session.user.email!,
        lastUsedAt: new Date().toISOString(),
      };
      await savePolicy(policyEntry);
    } else if (accessRequest.policy.matchedPolicyId) {
      // Increment usage count for matched policy
      await incrementPolicyUsage(
        accessRequest.policy.matchedPolicyId,
        accessRequest.taskDescription
      );
    }

    // 15. Audit log
    await audit({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "request_approved",
      lane: "lane-b",
      accountId: accessRequest.accountId,
      accountName: accessRequest.accountName,
      metadata: {
        requestId: accessRequest.requestId,
        requesterId: accessRequest.userId,
        requesterEmail: accessRequest.userEmail,
        sessionId,
        roleName,
      },
      request,
    });

    return successResponse({
      requestId: accessRequest.requestId,
      status: "approved",
      sessionId,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: expiresAt,
        region: APP_CONFIG.region,
      },
      consoleUrl,
      expiresAt,
    });
  } catch (error: any) {
    console.error("Approval credential vending failed:", error);
    return errorResponse(
      "Failed to create session after approval. The request remains pending.",
      500
    );
  }
}

function buildConsoleUrl(credentials: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}): string {
  const sessionJson = JSON.stringify({
    sessionId: credentials.accessKeyId,
    sessionKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  });
  return `https://signin.aws.amazon.com/federation?Action=getSigninToken&SessionDuration=3600&Session=${encodeURIComponent(sessionJson)}`;
}
