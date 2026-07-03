import { NextRequest } from "next/server";
import { queryAuditLogs } from "@/lib/db";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/audit
 *
 * Query audit logs with optional filters.
 * Params: userId, accountId, startDate, endDate, limit
 */
export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);

  const params = {
    userId: searchParams.get("userId") || undefined,
    accountId: searchParams.get("accountId") || undefined,
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    limit: searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : 50,
  };

  try {
    const logs = await queryAuditLogs(params);
    return successResponse({ logs });
  } catch (error) {
    console.error("Audit log query error:", error);
    return errorResponse("Failed to query audit logs", 500);
  }
}
