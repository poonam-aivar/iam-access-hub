import { NextRequest } from "next/server";
import { getAllPolicies, getPolicy } from "@/lib/db";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/policies
 *
 * List all policies in the reusable policy library.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const policies = await getAllPolicies();
    return successResponse({ policies });
  } catch (error) {
    console.error("Policy library query error:", error);
    return errorResponse("Failed to load policy library", 500);
  }
}
