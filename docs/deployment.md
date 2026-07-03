# Deployment Guide — IAM Access Hub

## Overview

The deployment has 3 parts:
1. **Infrastructure** (CDK) — DynamoDB tables, Lambda, IAM roles
2. **Application** (Amplify) — Next.js frontend + API
3. **CI/CD** (GitHub Actions) — automated on push to main

---

## Prerequisites

- AWS CLI configured with admin-level access to the target account
- Node.js 22+ installed locally
- AWS CDK CLI: `npm install -g aws-cdk`
- The GitHub repo: https://github.com/poonam-aivar/iam-access-hub

---

## Step 1: Set Up AWS Credentials for GitHub Actions

The OIDC provider `token.actions.githubusercontent.com` must already exist in your AWS account.

### Create the deploy role:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:poonam-aivar/iam-access-hub:*"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name GitHubActions-IAMAccessHub-Deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --tags Key=project,Value=iam-access-hub Key=purpose,Value=warpspeed Key=owner,Value=poonam-aivar

aws iam attach-role-policy \
  --role-name GitHubActions-IAMAccessHub-Deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

3. Add as GitHub repo secrets:
   - `AWS_DEPLOY_ROLE_ARN` → the role ARN from above

4. Add a GitHub repo variable:
   - Go to: Settings → Variables → Actions
   - Add variable: `USE_OIDC` = `true`

---

## Step 2: Deploy Infrastructure (CDK)

### First time (bootstrap CDK in your account):
```bash
cd infra
npm install
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-south-1
```

### Deploy all stacks:
```bash
npx cdk deploy --all --require-approval never
```

This creates:
- 4 DynamoDB tables (Requests, PolicyLibrary, Sessions, AuditLogs)
- 1 Lambda function (session cleanup, runs every 5 min)
- 1 EventBridge rule (triggers cleanup Lambda)
- 1 IAM role (portal execution role)

Note the outputs — you'll need `PortalRoleArn`.

---

## Step 3: Set Up IAM Identity Center OIDC Application

1. Go to **AWS IAM Identity Center** in the console
2. Click **Applications** → **Add application** → **Add custom SAML 2.0 application** (or OIDC if available)
3. Configure:
   - Application name: `IAM Access Hub`
   - Reply URL: `https://YOUR_AMPLIFY_DOMAIN/api/auth/callback/aws-sso`
   - (You'll update this after Amplify deploys)
4. Note down:
   - Issuer URL (e.g., `https://d-xxxxxxxxxx.awsapps.com/sso`)
   - Client ID
   - Client Secret

---

## Step 4: Store Secrets in SSM Parameter Store

```bash
# NextAuth secret (random)
aws ssm put-parameter \
  --name /iam-access-hub/nextauth-secret \
  --value "$(openssl rand -base64 32)" \
  --type SecureString

# SSO OIDC credentials
aws ssm put-parameter \
  --name /iam-access-hub/sso-issuer-url \
  --value "https://d-xxxxxxxxxx.awsapps.com/sso" \
  --type SecureString

aws ssm put-parameter \
  --name /iam-access-hub/sso-client-id \
  --value "YOUR_CLIENT_ID" \
  --type SecureString

aws ssm put-parameter \
  --name /iam-access-hub/sso-client-secret \
  --value "YOUR_CLIENT_SECRET" \
  --type SecureString

# Portal role ARN (from CDK output)
aws ssm put-parameter \
  --name /iam-access-hub/portal-role-arn \
  --value "arn:aws:iam::YOUR_ACCOUNT_ID:role/IAMAccessHub-PortalRole" \
  --type String
```

---

## Step 5: Deploy to AWS Amplify

### Via Console (easiest):

1. Go to **AWS Amplify** → **Create new app**
2. Select **GitHub** → Authorize → Select `poonam-aivar/iam-access-hub`
3. Branch: `main`
4. Build settings: it will auto-detect `amplify.yml`
5. **Environment variables** — add these:

| Variable | Value |
|----------|-------|
| `NEXTAUTH_URL` | `https://your-app-id.amplifyapp.com` (update after first deploy) |
| `NEXTAUTH_SECRET` | (from SSM: /iam-access-hub/nextauth-secret) |
| `AWS_SSO_ISSUER_URL` | (from SSM: /iam-access-hub/sso-issuer-url) |
| `AWS_SSO_CLIENT_ID` | (from SSM: /iam-access-hub/sso-client-id) |
| `AWS_SSO_CLIENT_SECRET` | (from SSM: /iam-access-hub/sso-client-secret) |
| `AWS_REGION` | `ap-south-1` |
| `PORTAL_ROLE_ARN` | `arn:aws:iam::ACCOUNT:role/IAMAccessHub-PortalRole` |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` |

6. Under **Advanced** → Service role: select `IAMAccessHub-PortalRole` (or create a new role with Amplify permissions + attach the portal role policies)
7. Click **Save and deploy**

### Via CLI:
```bash
aws amplify create-app \
  --name iam-access-hub \
  --repository https://github.com/poonam-aivar/iam-access-hub \
  --oauth-token YOUR_GITHUB_TOKEN \
  --platform WEB_COMPUTE \
  --environment-variables '{
    "NEXTAUTH_URL": "https://placeholder.amplifyapp.com",
    "AWS_REGION": "ap-south-1",
    "BEDROCK_MODEL_ID": "anthropic.claude-3-haiku-20240307-v1:0"
  }'
```

---

## Step 6: Update Account IDs

Edit `apps/web/src/config/accounts.ts` and replace all `PLACEHOLDER` values with actual AWS account IDs:

```typescript
{
  accountId: "123456789012",  // ← actual account ID
  accountName: "Agentic-Polo",
  ...
}
```

Commit and push — Amplify will auto-deploy.

---

## Step 7: Verify

1. Open the Amplify URL
2. You should see the login page
3. Click "Sign in with AWS SSO"
4. After SSO auth, you should land on the dashboard
5. Test Lane A: select an account and role, get credentials
6. Test Lane B: submit a request, check the approval queue

---

## Deployment Order (summary)

```
1. Add AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY to GitHub secrets
2. Push to main → GitHub Actions runs CDK deploy → creates infra
3. Set up SSO OIDC app → store secrets in SSM
4. Connect repo to Amplify → set env vars → deploy
5. Update account IDs → push → auto-deploys
6. Test
```

---

## Troubleshooting

### GitHub Actions: "Credentials could not be loaded"
- **Cause:** No AWS credentials configured as secrets
- **Fix:** Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to repo secrets (Settings → Secrets → Actions)

### GitHub Actions: "Node 20 deprecated"
- **Fixed:** Workflow now uses Node 22

### Amplify: Build fails
- Check that `amplify.yml` is in the repo root
- Check that all env vars are set in Amplify console

### Auth: "Callback URL mismatch"
- Update `NEXTAUTH_URL` in Amplify env vars to match the actual deployed URL
- Update the callback URL in the IAM Identity Center OIDC app

### Lane A: "You do not have access"
- Verify the user has a permission set assigned in IAM Identity Center for that account
- Verify the access token is being passed correctly

---

## Cost (reminder)

At expected usage (30-50 sessions/month): **~$0.11-0.61/month**
- Everything within free tier except Bedrock (~$0.11/month)
