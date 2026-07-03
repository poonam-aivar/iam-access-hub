import { NextAuthOptions } from "next-auth";

/**
 * NextAuth configuration with AWS IAM Identity Center as OIDC provider.
 *
 * Setup requirements:
 * 1. In IAM Identity Center, create a custom OIDC application
 * 2. Set the redirect URI to: {NEXTAUTH_URL}/api/auth/callback/aws-sso
 * 3. Note the issuer URL, client ID, and client secret
 * 4. Store these in SSM Parameter Store (not env vars in production)
 */
export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "aws-sso",
      name: "AWS SSO",
      type: "oauth",
      wellKnown: `${process.env.SSO_ISSUER_URL}/.well-known/openid-configuration`,
      clientId: process.env.SSO_CLIENT_ID!,
      clientSecret: process.env.SSO_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
      idToken: true,
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.email,
          email: profile.email,
          image: null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, persist the SSO access token
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.ssoUserId = profile?.sub;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose SSO info to the client session
      return {
        ...session,
        accessToken: token.accessToken as string,
        user: {
          ...session.user,
          id: token.ssoUserId as string,
        },
      };
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // 30 minutes — short session for security
    maxAge: 30 * 60,
  },
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
};
