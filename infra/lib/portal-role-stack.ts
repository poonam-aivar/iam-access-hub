import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface PortalRoleStackProps extends cdk.StackProps {
  requestsTable: dynamodb.Table;
  policyLibraryTable: dynamodb.Table;
  sessionsTable: dynamodb.Table;
  auditLogsTable: dynamodb.Table;
}

/**
 * Portal Role Stack — IAM role for the IAM Access Hub application.
 *
 * This role is assumed by the Next.js app running on Amplify.
 * It has carefully scoped permissions to:
 * 1. Create/delete session roles (IAM) — scoped to IAMAccessHub-* prefix
 * 2. Assume session roles (STS) — scoped to IAMAccessHub-* prefix
 * 3. Read SSO account/role info
 * 4. Call Bedrock for policy generation
 * 5. Read/write DynamoDB tables
 * 6. Read SSM parameters
 */
export class PortalRoleStack extends cdk.Stack {
  public readonly portalRole: iam.Role;

  constructor(scope: Construct, id: string, props: PortalRoleStackProps) {
    super(scope, id, props);

    // The portal role — trusted by Amplify's compute role
    this.portalRole = new iam.Role(this, "PortalExecutionRole", {
      roleName: "IAMAccessHub-PortalRole",
      description:
        "Execution role for IAM Access Hub portal (Next.js on Amplify)",
      assumedBy: new iam.CompositePrincipal(
        // Amplify compute
        new iam.ServicePrincipal("amplify.amazonaws.com"),
        // Lambda (for SSR)
        new iam.ServicePrincipal("lambda.amazonaws.com")
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // ============================================================
    // IAM — Create/manage session roles ONLY with our prefix
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ManageSessionRoles",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:DetachRolePolicy",
          "iam:TagRole",
        ],
        resources: [`arn:aws:iam::${this.account}:role/IAMAccessHub-*`],
      })
    );

    // ============================================================
    // STS — Assume only our session roles
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeSessionRoles",
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/IAMAccessHub-*`],
        conditions: {
          StringEquals: {
            "sts:ExternalId": "iam-access-hub",
          },
        },
      })
    );

    // ============================================================
    // STS — Get caller identity (for health checks)
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "STSIdentity",
        effect: iam.Effect.ALLOW,
        actions: ["sts:GetCallerIdentity"],
        resources: ["*"],
      })
    );

    // ============================================================
    // SSO — Read-only access to list accounts and get credentials
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSOReadAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "sso:ListAccounts",
          "sso:ListAccountRoles",
          "sso:GetRoleCredentials",
        ],
        resources: ["*"],
      })
    );

    // ============================================================
    // Bedrock — Invoke model for policy generation
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockInvoke",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0`,
        ],
      })
    );

    // ============================================================
    // DynamoDB — Read/write our tables only
    // ============================================================
    props.requestsTable.grantReadWriteData(this.portalRole);
    props.policyLibraryTable.grantReadWriteData(this.portalRole);
    props.sessionsTable.grantReadWriteData(this.portalRole);
    props.auditLogsTable.grantReadWriteData(this.portalRole);

    // ============================================================
    // SSM — Read parameters (for secrets/config)
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSMReadParameters",
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/iam-access-hub/*`,
        ],
      })
    );

    // ============================================================
    // CloudWatch Logs — for Lambda@Edge / SSR logs
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/amplify/*`,
        ],
      })
    );

    // ============================================================
    // EXPLICIT DENY — prevent privilege escalation
    // Even if someone modifies the role, these are hard-blocked
    // ============================================================
    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DenyPrivilegeEscalation",
        effect: iam.Effect.DENY,
        actions: [
          // Cannot modify its own role
          "iam:AttachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DetachRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:UpdateRole",
          "iam:UpdateAssumeRolePolicy",
        ],
        resources: [
          `arn:aws:iam::${this.account}:role/IAMAccessHub-PortalRole`,
        ],
      })
    );

    this.portalRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DenyDangerousActions",
        effect: iam.Effect.DENY,
        actions: [
          // Cannot create users or access keys
          "iam:CreateUser",
          "iam:CreateAccessKey",
          "iam:CreateLoginProfile",
          // Cannot modify SSO
          "sso:*",
          "sso-admin:*",
          "identitystore:*",
          // Cannot modify Organizations
          "organizations:*",
        ],
        resources: ["*"],
      })
    );

    // ============================================================
    // OUTPUTS
    // ============================================================
    new cdk.CfnOutput(this, "PortalRoleArn", {
      value: this.portalRole.roleArn,
      description: "ARN of the portal execution role",
    });

    new cdk.CfnOutput(this, "PortalRoleName", {
      value: this.portalRole.roleName,
    });
  }
}
