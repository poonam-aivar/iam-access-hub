import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface AppRunnerStackProps extends cdk.StackProps {
  portalRoleArn: string;
}

/**
 * App Runner Stack — Hosts the Next.js application.
 *
 * Creates:
 * 1. ECR repository (stores Docker images)
 * 2. App Runner access role (allows App Runner to pull from ECR)
 * 3. App Runner service (runs the container)
 *
 * The service auto-scales to zero when idle (min 1 instance when active).
 * Cost: ~$0 when idle, pennies per request when active.
 */
export class AppRunnerStack extends cdk.Stack {
  public readonly ecrRepository: ecr.Repository;
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: AppRunnerStackProps) {
    super(scope, id, props);

    // ============================================================
    // ECR Repository
    // ============================================================
    this.ecrRepository = new ecr.Repository(this, "AppRepo", {
      repositoryName: "iam-access-hub",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: "Keep only last 5 images",
        },
      ],
    });

    // ============================================================
    // App Runner ECR Access Role
    // Allows App Runner to pull images from our ECR repo
    // ============================================================
    const accessRole = new iam.Role(this, "AppRunnerECRAccessRole", {
      roleName: "IAMAccessHub-AppRunnerAccess",
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });

    this.ecrRepository.grantPull(accessRole);

    // ============================================================
    // App Runner Instance Role
    // The role the running container assumes (same as portal role)
    // ============================================================
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      roleName: "IAMAccessHub-AppRunnerInstance",
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    // Grant same permissions as the portal role
    instanceRole.addToPolicy(
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

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeSessionRoles",
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/IAMAccessHub-*`],
        conditions: {
          StringEquals: { "sts:ExternalId": "iam-access-hub" },
        },
      })
    );

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "STSIdentity",
        effect: iam.Effect.ALLOW,
        actions: ["sts:GetCallerIdentity"],
        resources: ["*"],
      })
    );

    instanceRole.addToPolicy(
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

    instanceRole.addToPolicy(
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

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DynamoDBAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/IAMAccessHub-*`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/IAMAccessHub-*/index/*`,
        ],
      })
    );

    instanceRole.addToPolicy(
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

    // Explicit deny on dangerous actions
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DenyDangerousActions",
        effect: iam.Effect.DENY,
        actions: [
          "iam:CreateUser",
          "iam:CreateAccessKey",
          "iam:CreateLoginProfile",
          "sso:*",
          "sso-admin:*",
          "identitystore:*",
          "organizations:*",
        ],
        resources: ["*"],
      })
    );

    // ============================================================
    // App Runner Service
    // ============================================================
    const service = new apprunner.CfnService(this, "AppRunnerService", {
      serviceName: "iam-access-hub",
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `${this.ecrRepository.repositoryUri}:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "8080",
            runtimeEnvironmentVariables: [
              { name: "APP_REGION", value: this.region },
              { name: "BEDROCK_MODEL_ID", value: "anthropic.claude-3-haiku-20240307-v1:0" },
              { name: "PORTAL_ROLE_ARN", value: props.portalRoleArn },
            ],
          },
        },
        autoDeploymentsEnabled: true,
      },
      instanceConfiguration: {
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/",
        interval: 20,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      tags: [
        { key: "project", value: "iam-access-hub" },
        { key: "purpose", value: "warpspeed" },
        { key: "owner", value: "poonam-aivar" },
      ],
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, "ECRRepositoryUri", {
      value: this.ecrRepository.repositoryUri,
      description: "ECR repository URI for pushing Docker images",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: `https://${service.attrServiceUrl}`,
      description: "App Runner service URL",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceArn", {
      value: service.attrServiceArn,
      description: "App Runner service ARN",
    });
  }
}
