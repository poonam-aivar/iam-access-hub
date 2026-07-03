import { NextRequest } from "next/server";
import { z } from "zod";
import { getRoleCredentials } from "@/lib/aws/sso";
import { createSession, getActiveSessions } from "@/lib/db";
import { validateSessionDuration } from "@/lib/guardrails";
import { APP_CONFIG } from "@/config/accounts";
import { V1_ACCOUNTS } from "@/config/accounts";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
  generateId,
  audit,
} from "@/lib/api-helpers";

const requestSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  roleName: z.string().min(1, "Role name is required"),
  durationHours: z.number().min(1).max(APP_CONFIG.maxSessionDurationHours),
});

/**
 * POST /api/access/lane-a
 *
 * Lane A: SSO credential vending.
 * Authenticated SSO users get instant credentials for accounts/roles
 * they already have access to via IAM Identity Center.
 *
 * No approval needed — just removes the manual console login friction.
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
  } catch (error) {
    return errorResponse("Invalid request body", 400);
  }

  // 3. Validate session duration
  const durationValidation = validateSessionDuration(body.durationHours);
  if (!durationValidation.valid) {
    return errorResponse(durationValidation.errors.join("; "), 400);
  }

  // 4. Check account is in V1 scope
  const account = V1_ACCOUNTS.find((a) => a.accountId === body.accountId);
  if (!account) {
    return errorResponse("Account not found or not in scope", 404);
  }

  // 5. Check concurrent session limit
  const activeSessions = await getActiveSessions(session.user.id);
  if (activeSessions.length >= APP_CONFIG.maxConcurrentSessions) {
    return errorResponse(
      `Maximum ${APP_CONFIG.maxConcurrentSessions} concurrent sessions allowed. Revoke an existing session first.`,
      429
    );
  }

  // 6. Vend credentials via SSO
  try {
    const credentials = await getRoleCredentials(
      session.accessToken,
      body.accountId,
      body.roleName
    );

    // 7. Generate console sign-in URL
    const consoleUrl = buildConsoleUrl(credentials);

    // 8. Record the session
    const sessionId = generateId();
    const expiresAt = new Date(
      Date.now() + body.durationHours * 60 * 60 * 1000
    ).toISOString();

    await createSession({
      sessionId,
      userId: session.user.id,
      userEmail: session.user.email!,
      lane: "lane-a",
      accountId: body.accountId,
      accountName: account.accountName,
      roleName: body.roleName,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    // 9. Audit log
    await audit({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "credentials_vended",
      lane: "lane-a",
      accountId: body.accountId,
      accountName: account.accountName,
      metadata: {
        roleName: body.roleName,
        durationHours: String(body.durationHours),
        sessionId,
      },
      request,
    });

    // 10. Return credentials
    return successResponse({
      sessionId,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: credentials.expiration.toISOString(),
        region: APP_CONFIG.region,
      },
      consoleUrl,
      expiresAt,
    });
  } catch (error: any) {
    console.error("Lane A credential vending failed:", error);

    if (error.name === "ForbiddenException") {
      return errorResponse(
        "You do not have access to this account/role via SSO",
        403
      );
    }

    return errorResponse("Failed to vend credentials", 500);
  }
}

/**
 * Build a federated AWS Console sign-in URL from temporary credentials.
 */
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

  // The actual sign-in flow requires a two-step process:
  // 1. Call federation endpoint to get a SigninToken
  // 2. Use SigninToken to build the console URL
  // For now, return the federation endpoint URL — the frontend will handle the redirect.
  const federationUrl = "https://signin.aws.amazon.com/federation";
  return `${federationUrl}?Action=getSigninToken&SessionDuration=3600&Session=${encodeURIComponent(sessionJson)}`;
}
