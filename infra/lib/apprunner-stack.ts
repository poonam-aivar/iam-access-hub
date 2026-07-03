import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface AppRunnerStackProps extends cdk.StackProps {
  portalRoleArn: string;
  ecrRepository: ecr.Repository;
}

/**
 * App Runner Stack — Hosts the Next.js application.
 * Deployed AFTER the Docker image has been pushed to ECR.
 */
export class AppRunnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppRunnerStackProps) {
    super(scope, id, props);

    // ============================================================
    // App Runner ECR Access Role
    // ============================================================
    const accessRole = new iam.Role(this, "AppRunnerECRAccessRole", {
      roleName: "IAMAccessHub-AppRunnerAccess",
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });

    props.ecrRepository.grantPull(accessRole);

    // ============================================================
    // App Runner Instance Role (what the container runs as)
    // ============================================================
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      roleName: "IAMAccessHub-AppRunnerInstance",
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    // IAM — manage session roles
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

    // STS — assume session roles
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

    // SSO — read-only
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

    // Bedrock — invoke model
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

    // DynamoDB — read/write our tables
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

    // SSM — read parameters
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

    // Explicit deny
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
          imageIdentifier: `${props.ecrRepository.repositoryUri}:latest`,
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
