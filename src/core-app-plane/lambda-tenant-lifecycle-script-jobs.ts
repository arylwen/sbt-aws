// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { LambdaScriptJob } from './lambda-script-job';
import { ScriptJobProps } from './script-job';
import { DetailType, IEventManager } from '../utils';

/**
 * Encapsulates the list of properties for ScriptJobs that
 * handle lifecycle management for tenants.
 */
export interface TenantLifecycleLambdaScriptJobProps {
  readonly permissions: iam.PolicyDocument;
  readonly script: string;
  readonly postScript?: string;
  readonly environmentStringVariablesFromIncomingEvent?: string[];
  readonly environmentJSONVariablesFromIncomingEvent?: string[];
  readonly environmentVariablesToOutgoingEvent?: string[];
  readonly scriptEnvironmentVariables?: { [key: string]: string };
  readonly eventManager: IEventManager;
}

/**
 * Provides a ProvisioningLambdaScriptJob to execute arbitrary bash code.
 * This is a simple wrapper around LambdaScriptJob that reduces some of the parameters
 * that need to be configured.
 */
export class ProvisioningLambdaScriptJob extends LambdaScriptJob {
  constructor(scope: Construct, id: string, props: TenantLifecycleLambdaScriptJobProps) {
    const lambdaScriptJobProps: ScriptJobProps = {
      ...props,
      jobIdentifierKey: 'tenantId',
      jobFailureStatus: {
        tenantStatus: 'Failed to provision tenant.',
      },
      incomingEvent: DetailType.ONBOARDING_REQUEST,
      outgoingEvent: {
        success: DetailType.PROVISION_SUCCESS,
        failure: DetailType.PROVISION_FAILURE,
      },
    };
    super(scope, id, lambdaScriptJobProps);

    // Adding NagSuppression for IAM4 warning (AWS managed policy usage)
    NagSuppressions.addResourceSuppressions(this.lambdaFunction.role!, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'Using the AWS managed policy AWSLambdaBasicExecutionRole for simplicity and to follow AWS best practices for basic Lambda execution. The policy provides essential permissions like writing logs to CloudWatch.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
    ]);

    // Adding NagSuppression for IAM5 warning (Wildcard permissions on the Lambda function role)
    //NagSuppressions.addResourceSuppressions(this.lambdaFunction.role!, [
    //  {
    //    id: 'AwsSolutions-IAM5',
    //    reason:
    //      'The wildcard permission is required for the Lambda function to have the necessary permissions to perform dynamic actions based on the input. Restricting permissions further would limit the flexibility needed for this job.',
    //    appliesTo: [`Resource::${this.lambdaFunction.functionArn}:*`],
    //  },
    //]);

    // Adding NagSuppression for IAM5 warning
    //NagSuppressions.addResourceSuppressions(
    //  this.provisioningStateMachine.role!,
    //  [
    //    {
    //      id: 'AwsSolutions-IAM5',
    //      reason:
    //        'The wildcard permission is required for the Lambda function to have the necessary permissions to perform the actions. Restricting permissions further would require an overly complex IAM policy with minimal security gain.',
    //      appliesTo: [
    //        `Resource::${this.lambdaFunction.functionArn}:*`, // Modify this based on actual resource that needs the suppression
    //      ],
    //    },
    //  ],
    //  true // applyToChildren = true, so that it applies to the IAM resources created for the state machine role
    //);

    // Adding NagSuppression for IAM5 warning (wildcard permissions)
    // NagSuppressions.addResourceSuppressions(
    //  this.provisioningStateMachine.role!,
    //  [
    //    {
    //      id: 'AwsSolutions-IAM5',
    //      reason:
    //        'Wildcard permissions are necessary for this Lambda function to perform dynamic actions across different AWS resources. Restricting permissions further would require an overly complex IAM policy with minimal security gain.',
    //      appliesTo: [
    //        `Resource::${this.lambdaFunction.functionArn}:*`,
    //        'Action::lambda:InvokeFunction',
    //        'Action::s3:PutObject',
    //        'Action::s3:GetObject',
    //        'Action::cloudformation:CreateStack',
    //        'Action::cloudformation:DescribeStacks',
    //        'Action::cloudformation:DeleteStack',
    //      ],
    //    },
    //  ],
    //  true // applyToChildren = true, so that it applies to the IAM resources created for the state machine role
    //);
  }
}

/**
 * Provides a DeprovisioningLambdaScriptJob to execute arbitrary bash code.
 * This is a simple wrapper around LambdaScriptJob that reduces some of the parameters
 * that need to be configured.
 */
export class DeprovisioningLambdaScriptJob extends LambdaScriptJob {
  constructor(scope: Construct, id: string, props: TenantLifecycleLambdaScriptJobProps) {
    const lambdaScriptJobProps: ScriptJobProps = {
      ...props,
      jobIdentifierKey: 'tenantId',
      jobFailureStatus: {
        tenantStatus: 'Failed to deprovision tenant.',
      },
      incomingEvent: DetailType.OFFBOARDING_REQUEST,
      outgoingEvent: {
        success: DetailType.DEPROVISION_SUCCESS,
        failure: DetailType.DEPROVISION_FAILURE,
      },
    };
    super(scope, id, lambdaScriptJobProps);

    // Adding NagSuppression for IAM4 warning (AWS managed policy usage)
    NagSuppressions.addResourceSuppressions(this.lambdaFunction.role!, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'Using the AWS managed policy AWSLambdaBasicExecutionRole for simplicity and to follow AWS best practices for basic Lambda execution. The policy provides essential permissions like writing logs to CloudWatch.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
    ]);

    // Adding NagSuppression for IAM5 warning (Wildcard permissions on the Lambda function role)
    //NagSuppressions.addResourceSuppressions(this.lambdaFunction.role!, [
    //  {
    //    id: 'AwsSolutions-IAM5',
    //    reason:
    //      'The wildcard permission is required for the Lambda function to have the necessary permissions to perform dynamic actions based on the input. Restricting permissions further would limit the flexibility needed for this job.',
    //    appliesTo: [`Resource::${this.lambdaFunction.functionArn}:*`],
    //  },
    //]);

    // Adding NagSuppression for IAM5 warning
    //NagSuppressions.addResourceSuppressions(
    //  this.provisioningStateMachine.role!,
    //  [
    //    {
    //      id: 'AwsSolutions-IAM5',
    //      reason:
    //        'The wildcard permission is required for the Lambda function to have the necessary permissions to perform the actions. Restricting permissions further would require an overly complex IAM policy with minimal security gain.',
    //      appliesTo: [
    //        `Resource::${this.lambdaFunction.functionArn}:*`, // Modify this based on actual resource that needs the suppression
    //      ],
    //    },
    //  ],
    //  true // applyToChildren = true, so that it applies to the IAM resources created for the state machine role
    //);

    // Adding NagSuppression for IAM5 warning (Wildcard permissions)
    //NagSuppressions.addResourceSuppressions(
    //  this.provisioningStateMachine.role!,
    //  [
    //    {
    //      id: 'AwsSolutions-IAM5',
    //      reason:
    //        'Wildcard permissions are necessary due to the dynamic nature of resources and the broad range of actions required by the Lambda function during provisioning. These permissions ensure that the function can perform all necessary operations without being overly restrictive.',
    //      appliesTo: ['Action::*', `Resource::*`],
    //    },
    //  ],
    //  true // applyToChildren = true, so that it applies to the IAM resources created for the state machine role
    //);
  }
}
