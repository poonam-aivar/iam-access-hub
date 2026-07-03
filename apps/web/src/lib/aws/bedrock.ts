import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { APP_CONFIG } from "@/config/accounts";
import { PolicyStatement, GeneratedPolicy, PolicyLibraryEntry } from "@/types";
import {
  BLOCKED_ACTIONS,
  validatePolicyStatements,
  sanitizeTaskDescription,
} from "@/lib/guardrails";

const bedrockClient = new BedrockRuntimeClient({ region: APP_CONFIG.region });

const SYSTEM_PROMPT = `You are an AWS IAM policy generator for the IAM Access Hub portal. Your job is to generate least-privilege IAM policies based on task descriptions.

CRITICAL RULES:
1. Generate ONLY the minimum permissions needed for the stated task.
2. NEVER use wildcard actions ("*") or wildcard resources ("*").
3. ALWAYS scope resources to specific ARNs with account ID and region.
4. Only use "Effect": "Allow" — never "Deny".
5. Do NOT include any of these blocked actions: ${BLOCKED_ACTIONS.slice(0, 20).join(", ")} (and others).
6. Maximum ${APP_CONFIG.maxPolicyActions} actions per statement.
7. Maximum ${APP_CONFIG.maxPolicyResources} resources per statement.
8. Do NOT use NotAction, NotResource, or NotPrincipal.
9. If the request is vague, generate the NARROWEST possible interpretation.
10. If the request asks for admin, full access, or destructive permissions, REFUSE and return an empty policy with an explanation.

RESPONSE FORMAT (JSON only, no markdown):
{
  "name": "descriptive-policy-name",
  "description": "What this policy allows",
  "statements": [
    {
      "Effect": "Allow",
      "Action": ["service:SpecificAction"],
      "Resource": ["arn:aws:service:region:account-id:resource"]
    }
  ],
  "reasoning": "Why these specific permissions are needed"
}`;

/**
 * Attempts to match a task description against existing policies in the library.
 * Returns the best match if one exists, null otherwise.
 *
 * For v1: exact matching only — the task must clearly map to an existing policy's
 * described use case.
 */
export async function matchPolicy(
  taskDescription: string,
  policyLibrary: PolicyLibraryEntry[]
): Promise<PolicyLibraryEntry | null> {
  if (policyLibrary.length === 0) return null;

  const { sanitized, suspicious } = sanitizeTaskDescription(taskDescription);
  if (suspicious) return null; // Don't match on suspicious input

  const prompt = `Given this task description: "${sanitized}"

And these existing policies:
${policyLibrary
  .map(
    (p, i) =>
      `${i + 1}. "${p.name}" - ${p.description} (used for: ${p.usedForTasks.slice(0, 3).join(", ")})`
  )
  .join("\n")}

Is there an EXACT match? The policy must cover precisely what's being asked — same actions, same scope. Do not match if the existing policy is broader or narrower than needed.

Respond with ONLY the policy number (1-indexed) if there's an exact match, or "NONE" if no match.`;

  const response = await invokeModel(prompt);
  const trimmed = response.trim();

  if (trimmed === "NONE" || trimmed === "none") return null;

  const matchIndex = parseInt(trimmed) - 1;
  if (isNaN(matchIndex) || matchIndex < 0 || matchIndex >= policyLibrary.length) {
    return null;
  }

  return policyLibrary[matchIndex];
}

/**
 * Generates a new least-privilege IAM policy from a task description.
 * The generated policy is validated against guardrails before being returned.
 */
export async function generatePolicy(
  taskDescription: string,
  accountId: string,
  region: string
): Promise<{
  policy: GeneratedPolicy | null;
  error: string | null;
  reasoning: string;
}> {
  const { sanitized, suspicious } = sanitizeTaskDescription(taskDescription);

  if (suspicious) {
    return {
      policy: null,
      error:
        "Task description contains suspicious patterns. Please describe your task in plain language without including policy syntax.",
      reasoning: "Input flagged as potential prompt injection",
    };
  }

  const prompt = `Generate a least-privilege IAM policy for this task:

Task: "${sanitized}"
AWS Account: ${accountId}
Region: ${region}

Remember: minimum permissions only. Scope all resources to this specific account and region.`;

  const response = await invokeModel(prompt);

  try {
    const parsed = JSON.parse(response);

    const statements: PolicyStatement[] = parsed.statements;

    // Validate against guardrails BEFORE returning
    const validation = validatePolicyStatements(statements);

    if (!validation.valid) {
      return {
        policy: null,
        error: `Generated policy failed security validation: ${validation.errors.join("; ")}`,
        reasoning: parsed.reasoning || "Policy violated guardrails",
      };
    }

    return {
      policy: {
        source: "generated",
        name: parsed.name,
        description: parsed.description,
        statements,
      },
      error: null,
      reasoning: parsed.reasoning || "",
    };
  } catch (parseError) {
    return {
      policy: null,
      error: "Failed to parse AI response into valid policy format",
      reasoning: "AI response was not valid JSON",
    };
  }
}

/**
 * Low-level Bedrock invocation
 */
async function invokeModel(prompt: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const command = new InvokeModelCommand({
    modelId: APP_CONFIG.bedrockModelId,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.content[0].text;
}

export { bedrockClient };
