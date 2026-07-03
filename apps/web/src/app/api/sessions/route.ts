import { NextRequest } from "next/server";
import { getActiveSessions, getAllActiveSessions } from "@/lib/db";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/sessions
 *
 * Lists active sessions.
 * Regular users see only their own; admins see all.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true";

  // TODO: Role check for admin view
  const sessions = all
    ? await getAllActiveSessions()
    : await getActiveSessions(session.user.id);

  return successResponse({ sessions });
}
