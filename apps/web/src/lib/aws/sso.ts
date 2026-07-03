import { SSOClient, GetRoleCredentialsCommand, ListAccountRolesCommand, ListAccountsCommand } from "@aws-sdk/client-sso";
import { APP_CONFIG } from "@/config/accounts";

const ssoClient = new SSOClient({ region: APP_CONFIG.region });

/**
 * Lists AWS accounts accessible to the SSO user.
 * Used in Lane A to show which accounts the user can access.
 */
export async function listUserAccounts(accessToken: string) {
  const command = new ListAccountsCommand({
    accessToken,
  });

  const response = await ssoClient.send(command);
  return response.accountList || [];
}

/**
 * Lists roles available to the user in a specific account.
 */
export async function listAccountRoles(
  accessToken: string,
  accountId: string
) {
  const command = new ListAccountRolesCommand({
    accessToken,
    accountId,
  });

  const response = await ssoClient.send(command);
  return response.roleList || [];
}

/**
 * Gets temporary credentials for a specific role in an account.
 * This is the core Lane A operation — instant credential vending for SSO users.
 */
export async function getRoleCredentials(
  accessToken: string,
  accountId: string,
  roleName: string
) {
  const command = new GetRoleCredentialsCommand({
    accessToken,
    accountId,
    roleName,
  });

  const response = await ssoClient.send(command);

  if (!response.roleCredentials) {
    throw new Error("SSO did not return role credentials");
  }

  return {
    accessKeyId: response.roleCredentials.accessKeyId!,
    secretAccessKey: response.roleCredentials.secretAccessKey!,
    sessionToken: response.roleCredentials.sessionToken!,
    expiration: new Date(response.roleCredentials.expiration!),
  };
}

export { ssoClient };
