import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import * as path from "path";

interface CleanupStackProps extends cdk.StackProps {
  sessionsTable: dynamodb.Table;
}

/**
 * Cleanup Stack — Lambda function triggered by EventBridge to:
 * 1. Delete expired IAM roles created for Lane B sessions
 * 2. Update session status in DynamoDB
 * 3. Log cleanup actions to audit trail
 *
 * Runs every 5 minutes to catch expired sessions promptly.
 */
export class CleanupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CleanupStackProps) {
    super(scope, id, props);

    // Cleanup Lambda
    const cleanupFn = new lambda.Function(this, "CleanupFunction", {
      functionName: "IAMAccessHub-SessionCleanup",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/cleanup")),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        SESSIONS_TABLE: props.sessionsTable.tableName,
        ROLE_PREFIX: "IAMAccessHub-",
      },
    });

    // Grant DynamoDB access
    props.sessionsTable.grantReadWriteData(cleanupFn);

    // Grant IAM permissions to delete session roles
    cleanupFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:DeleteRole",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:DetachRolePolicy",
          "iam:GetRole",
        ],
        resources: [`arn:aws:iam::${this.account}:role/IAMAccessHub-*`],
      })
    );

    // EventBridge rule — runs every 5 minutes
    const rule = new events.Rule(this, "CleanupSchedule", {
      ruleName: "IAMAccessHub-CleanupSchedule",
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: "Triggers session cleanup for IAM Access Hub",
    });

    rule.addTarget(new targets.LambdaFunction(cleanupFn));

    // Output
    new cdk.CfnOutput(this, "CleanupFunctionArn", {
      value: cleanupFn.functionArn,
    });
  }
}
