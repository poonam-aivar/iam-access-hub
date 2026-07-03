import { NextRequest } from "next/server";
import { z } from "zod";
import { generatePolicy } from "@/lib/aws/bedrock";
import { sanitizeTaskDescription } from "@/lib/guardrails";
import { APP_CONFIG } from "@/config/accounts";
import {
  getAuthenticatedSession,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

const requestSchema = z.object({
  taskDescription: z
    .string()
    .min(20, "Task description must be at least 20 characters")
    .max(500, "Task description must be under 500 characters"),
  accountId: z.string().min(1, "Account ID is required"),
  region: z.string().optional(),
});

/**
 * POST /api/ai/generate-policy
 *
 * Standalone policy generation endpoint.
 * Used for preview/dry-run before submitting a full Lane B request.
 * Also used by the admin panel to test policy generation.
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const session = await getAuthenticatedSession();
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  // 2. Parse & validate
  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await request.json();
    body = requestSchema.parse(raw);
  } catch (error: any) {
    const message = error?.issues?.[0]?.message || "Invalid request body";
    return errorResponse(message, 400);
  }

  // 3. Sanitize input
  const { sanitized, suspicious } = sanitizeTaskDescription(body.taskDescription);
  if (suspicious) {
    return errorResponse(
      "Task description contains suspicious patterns. Please describe your task in plain language.",
      400
    );
  }

  // 4. Generate policy
  try {
    const result = await generatePolicy(
      sanitized,
      body.accountId,
      body.region || APP_CONFIG.region
    );

    if (result.error) {
      return errorResponse(result.error, 422);
    }

    return successResponse({
      policy: result.policy,
      reasoning: result.reasoning,
      warnings: [],
    });
  } catch (error) {
    console.error("Policy generation error:", error);
    return errorResponse("Failed to generate policy", 500);
  }
}
