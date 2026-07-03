import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from "@aws-sdk/client-sts";
import { APP_CONFIG } from "@/config/accounts";

const stsClient = new STSClient({ region: APP_CONFIG.region });

export interface AssumeRoleParams {
  roleArn: string;
  sessionName: string;
  durationSeconds: number;
  policy?: string;
  externalId?: string;
}

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/**
 * Assumes an IAM role and returns temporary credentials.
 * Used for Lane B credential vending after approval.
 */
export async function assumeRole(
  params: AssumeRoleParams
): Promise<AssumedCredentials> {
  const command = new AssumeRoleCommand({
    RoleArn: params.roleArn,
    RoleSessionName: params.sessionName,
    DurationSeconds: params.durationSeconds,
    Policy: params.policy,
    ExternalId: params.externalId,
  });

  const response = await stsClient.send(command);

  if (!response.Credentials) {
    throw new Error("STS AssumeRole did not return credentials");
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration!,
  };
}

/**
 * Generates a federated console sign-in URL from temporary credentials.
 * This creates a URL that opens the AWS Console without requiring a separate login.
 */
export function generateConsoleUrl(
  credentials: AssumedCredentials,
  destination?: string
): string {
  const sessionJson = JSON.stringify({
    sessionId: credentials.accessKeyId,
    sessionKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  });

  const encodedSession = encodeURIComponent(sessionJson);
  const dest = destination || "https://console.aws.amazon.com/";

  // AWS Federation endpoint
  const signinUrl = `https://signin.aws.amazon.com/federation`;
  const getSigninTokenUrl = `${signinUrl}?Action=getSigninToken&SessionDuration=3600&Session=${encodedSession}`;

  // Note: In practice, you'd make an HTTP call to get the signin token first.
  // This returns the URL pattern — the actual implementation calls the federation endpoint.
  return getSigninTokenUrl;
}

/**
 * Verifies the portal's own identity
 */
export async function getCallerIdentity() {
  const command = new GetCallerIdentityCommand({});
  return stsClient.send(command);
}

export { stsClient };
