# Security Model — IAM Access Hub

## Threat Model

### Attack Vectors & Mitigations

| # | Attack | Mitigation |
|---|--------|-----------|
| 1 | Portal endpoint exposed to internet | VPN/Zero Trust only; not public |
| 2 | Stolen session cookie | 30-min session TTL, device binding, secure cookies |
| 3 | AdministratorAccess request | Hard-blocked in guardrails — cannot be requested, generated, or approved |
| 4 | AI generates overly broad policy | Guardrail validator rejects wildcards, blocked actions, and service-level permissions |
| 5 | Prompt injection via task description | Input sanitization strips suspicious patterns; flagged for review |
| 6 | Self-approval of requests | Enforced: requester ≠ approver |
| 7 | Credential hoarding | Max 2 concurrent sessions per user |
| 8 | Stale credentials | Max 4hr lifetime, auto-cleanup every 5 min |
| 9 | Policy library poisoning | Policies validated against guardrails at reuse-time too |
| 10 | Lateral movement via STS | `sts:AssumeRole` blocked in all generated policies |

## Hard-Blocked Policies

These managed policies can NEVER be attached, regardless of who approves:

- `arn:aws:iam::aws:policy/AdministratorAccess`
- `arn:aws:iam::aws:policy/IAMFullAccess`
- `arn:aws:iam::aws:policy/PowerUserAccess`
- `arn:aws:iam::aws:policy/AWSOrganizationsFullAccess`
- `arn:aws:iam::aws:policy/AWSAccountManagementFullAccess`

## Hard-Blocked Actions

See `src/lib/guardrails/index.ts` for the full list. Key categories:

- **IAM mutations** — no creating users, roles, or access keys
- **STS lateral movement** — no assuming other roles
- **Organizations/Account** — no org-level changes
- **Destructive data** — no deleting buckets, databases, tables
- **Security monitoring** — cannot disable CloudTrail, GuardDuty, Config
- **Networking** — no VPC peering, security group changes
- **KMS** — no key deletion or policy changes
- **SSO** — portal cannot modify Identity Center config

## Credential Limits

| Limit | Value |
|-------|-------|
| Max session duration | 4 hours |
| Default session duration | 1 hour |
| Max concurrent sessions | 2 per user |
| Max requests per hour | 5 per user |
| Request auto-expiry | 24 hours if not approved |
| Max actions per policy | 10 |
| Max resources per policy | 5 |
| Audit log retention | 90 days |

## Authentication

- **SSO-only** — no local accounts, no username/password
- **OIDC provider** — AWS IAM Identity Center
- **Session** — JWT, 30-min max age, secure httpOnly cookies
- **Step-up auth** — re-auth required for credential vending

## Audit Trail

Every action is logged to DynamoDB with:
- Who (user ID, email)
- What (action type, account, policy)
- When (timestamp)
- Where (IP address, user agent)
- How (lane, approval details)

Retention: 90 days in DynamoDB, indefinite in CloudTrail.
