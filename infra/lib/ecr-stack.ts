import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

/**
 * ECR Stack — Creates the container registry.
 * Deployed BEFORE the Docker image is built and pushed.
 */
export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, "AppRepo", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: "Keep only last 5 images",
        },
      ],
    });

    new cdk.CfnOutput(this, "ECRRepositoryUri", {
      value: this.repository.repositoryUri,
      description: "ECR repository URI for pushing Docker images",
    });
  }
}
