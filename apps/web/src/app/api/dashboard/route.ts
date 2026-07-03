import { NextRequest } from "next/server";
import {
  getAllActiveSessions,
  getRequestsByStatus,
  getAllPolicies,
  queryAuditLogs,
} from "@/lib/db";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/dashboard
 *
 * Returns summary stats for the dashboard.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const [activeSessions, pendingRequests, policies, todayLogs] =
      await Promise.all([
        getAllActiveSessions(),
        getRequestsByStatus("pending"),
        getAllPolicies(),
        queryAuditLogs({
          startDate: new Date(
            new Date().setHours(0, 0, 0, 0)
          ).toISOString(),
          limit: 100,
        }),
      ]);

    const sessionsToday = todayLogs.filter(
      (log) =>
        log.action === "credentials_vended" || log.action === "session_created"
    );

    return successResponse({
      activeSessions: activeSessions.length,
      pendingRequests: pendingRequests.length,
      policyCount: policies.length,
      sessionsToday: sessionsToday.length,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return successResponse({
      activeSessions: 0,
      pendingRequests: 0,
      policyCount: 0,
      sessionsToday: 0,
    });
  }
}
