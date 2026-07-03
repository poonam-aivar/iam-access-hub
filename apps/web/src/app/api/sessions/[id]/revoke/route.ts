import { NextRequest } from "next/server";
import { deleteSession, getActiveSessions, getAllActiveSessions } from "@/lib/db";
import { deleteSessionRole, ROLE_PREFIX } from "@/lib/aws/iam";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
  audit,
} from "@/lib/api-helpers";

/**
 * POST /api/sessions/[id]/revoke
 *
 * Revokes an active session by:
 * 1. Deleting the IAM role (if Lane B) — this immediately invalidates the STS credentials
 * 2. Removing the session record from DynamoDB
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Authenticate
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  // 2. Find the session to revoke
  // Check user's own sessions first, then admin view
  const userSessions = await getActiveSessions(session.user.id);
  let targetSession = userSessions.find((s) => s.sessionId === params.id);

  if (!targetSession) {
    // Admin might be revoking someone else's session
    // TODO: Add role check for admin
    const allSessions = await getAllActiveSessions();
    targetSession = allSessions.find((s) => s.sessionId === params.id);

    if (!targetSession) {
      return errorResponse("Session not found or already expired", 404);
    }
  }

  try {
    // 3. If Lane B, delete the IAM role to immediately revoke credentials
    if (
      targetSession.lane === "lane-b" &&
      targetSession.roleName.startsWith(ROLE_PREFIX)
    ) {
      try {
        await deleteSessionRole(targetSession.roleName);
      } catch (error) {
        console.error("Failed to delete IAM role:", error);
        // Continue — session record should still be cleaned up
      }
    }

    // 4. Delete session record
    await deleteSession(targetSession.sessionId);

    // 5. Audit log
    await audit({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "session_revoked",
      lane: targetSession.lane,
      accountId: targetSession.accountId,
      accountName: targetSession.accountName,
      metadata: {
        sessionId: targetSession.sessionId,
        revokedUser: targetSession.userEmail,
        roleName: targetSession.roleName,
      },
      request,
    });

    return successResponse({
      message: "Session revoked successfully",
      sessionId: targetSession.sessionId,
    });
  } catch (error) {
    console.error("Session revocation failed:", error);
    return errorResponse("Failed to revoke session", 500);
  }
}
