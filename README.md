# IAM Access Hub

Centralised self-service portal for AWS access. One front door for everyone — SSO users get instant, approval-free sessions; non-SSO users request scoped access via AI-generated policies with DevOps approval.

## Architecture

```
                    AWS Amplify (Hosting)
                          │
                   Next.js 14 (App Router)
                          │
           ┌──────────────┼──────────────┐
           │              │              │
    Lane A: SSO      Lane B: Non-SSO    Admin Panel
    (Instant)        (Approval-based)   (DevOps)
           │              │              │
    IAM Identity     Bedrock Claude     DynamoDB
    Center (SSO)     (Policy Gen)      (Audit Logs)
           │              │
    GetRoleCredentials   STS AssumeRole
           │              │
           └──────┬───────┘
                  │
         Short-lived credentials
         (Console URL / CLI creds)
```

## V1 Accounts

- Agentic-Polo
- Agentic-Systems
- Aivar Agents
- Aivar Convogent.dev
- Aivar Velogent.dev
- Chatbots
- Cloud Migration
- Cloud Modernization
- Document Extraction
- mlops

## Tech Stack

| Layer | Service |
|-------|---------|
| Frontend + API | Next.js 14, Tailwind CSS, shadcn/ui |
| Hosting | AWS Amplify |
| Auth | NextAuth.js + IAM Identity Center OIDC |
| Database | DynamoDB (on-demand) |
| AI | Amazon Bedrock (Claude Haiku) |
| Credential Vending | STS AssumeRole, SSO GetRoleCredentials |
| Cleanup | Lambda + EventBridge (every 5 min) |
| Secrets | SSM Parameter Store |
| Audit | DynamoDB + CloudTrail |
| IaC | AWS CDK (TypeScript) |

## Security

See [docs/security.md](docs/security.md) for the full threat model.

Key controls:
- **Portal behind VPN/Zero Trust** — not public internet
- **SSO-only auth** — no local accounts
- **30-minute session timeout** — re-auth required
- **Hard-blocked actions** — AdministratorAccess, IAM mutations, destructive ops blocked regardless of approval
- **AI output always validated** — guardrails run before AND after approval
- **Max 4-hour credential lifetime** — auto-expires
- **Max 2 concurrent sessions** — prevents hoarding
- **Full audit trail** — every action logged

## Project Structure

```
iam-access-hub/
├── apps/web/              # Next.js application
│   ├── src/
│   │   ├── app/           # App Router pages + API routes
│   │   ├── components/    # UI components
│   │   ├── lib/
│   │   │   ├── aws/       # STS, IAM, SSO, Bedrock clients
│   │   │   ├── db/        # DynamoDB operations
│   │   │   └── guardrails/# Security validators
│   │   ├── config/        # Account registry, app config
│   │   └── types/         # TypeScript types
│   └── ...
├── infra/                 # AWS CDK
│   ├── lib/               # Stack definitions
│   ├── lambda/            # Lambda function code
│   └── bin/               # CDK app entry
└── docs/                  # Documentation
```

## Getting Started

### Prerequisites

- Node.js 20+
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

### Setup

```bash
# Install dependencies
npm install

# Copy env file
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your values

# Run development server
npm run dev

# Deploy infrastructure
npm run infra:deploy
```

### Environment Variables

See `apps/web/.env.example` for all required variables. In production, these come from SSM Parameter Store.

## Cost

Estimated $0.11-0.61/month at expected usage (30-50 sessions/month):
- DynamoDB: Free tier
- Lambda: Free tier
- Bedrock Claude Haiku: ~$0.11/month
- Amplify: Free tier
- Everything else: Free (STS, IAM, SSO, EventBridge, CloudTrail)

## Related

- [Issue #251](https://github.com/aivar-tech/project-warp-speed/issues/251) — Original proposal
- Warp Speed #125 — SafeUpgrade (shipped)
- Warp Speed #50 — EC2 scheduled stop/start (shipped)
