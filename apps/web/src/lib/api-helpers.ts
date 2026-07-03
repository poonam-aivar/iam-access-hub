import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/db";
import { AuditAction, AccessLane } from "@/types";

/**
 * Get the authenticated session or return 401.
 * Use in all protected API routes.
 */
export async function getAuthenticatedSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

/**
 * Standard error response
 */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard success response
 */
export function successResponse(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Generate a unique ID for requests, sessions, etc.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Write an audit log entry with common fields populated
 */
export async function audit(params: {
  userId: string;
  userEmail: string;
  action: AuditAction;
  lane: AccessLane;
  accountId: string;
  accountName: string;
  metadata?: Record<string, string>;
  request?: Request;
}) {
  const entry = {
    logId: generateId(),
    timestamp: new Date().toISOString(),
    userId: params.userId,
    userEmail: params.userEmail,
    action: params.action,
    lane: params.lane,
    accountId: params.accountId,
    accountName: params.accountName,
    metadata: params.metadata || {},
    ipAddress: params.request?.headers.get("x-forwarded-for") || "unknown",
    userAgent: params.request?.headers.get("user-agent") || "unknown",
  };

  try {
    await writeAuditLog(entry);
  } catch (error) {
    // Don't fail the request if audit logging fails — but log it
    console.error("Failed to write audit log:", error);
  }
}
