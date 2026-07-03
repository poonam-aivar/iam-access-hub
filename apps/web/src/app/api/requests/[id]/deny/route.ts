import { NextRequest } from "next/server";
import { z } from "zod";
import { getRequest, updateRequestStatus } from "@/lib/db";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
  audit,
} from "@/lib/api-helpers";

const denySchema = z.object({
  note: z
    .string()
    .min(5, "Denial reason must be at least 5 characters")
    .max(500),
});

/**
 * POST /api/requests/[id]/deny
 *
 * DevOps denies a pending Lane B request.
 * A reason is required so the requester knows what to change.
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

  // 2. Parse body — reason is required
  let body: z.infer<typeof denySchema>;
  try {
    const raw = await request.json();
    body = denySchema.parse(raw);
  } catch (error: any) {
    const message =
      error?.issues?.[0]?.message || "Denial reason is required";
    return errorResponse(message, 400);
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

  // 5. Self-denial doesn't need blocking, but let's be consistent
  // (Users might want to cancel their own request — handled separately)

  // 6. Update status
  await updateRequestStatus(
    accessRequest.requestId,
    "denied",
    session.user.email!,
    body.note
  );

  // 7. Audit log
  await audit({
    userId: session.user.id,
    userEmail: session.user.email!,
    action: "request_denied",
    lane: "lane-b",
    accountId: accessRequest.accountId,
    accountName: accessRequest.accountName,
    metadata: {
      requestId: accessRequest.requestId,
      requesterId: accessRequest.userId,
      requesterEmail: accessRequest.userEmail,
      reason: body.note,
    },
    request,
  });

  return successResponse({
    requestId: accessRequest.requestId,
    status: "denied",
    reviewNote: body.note,
  });
}
