// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { IRuleTarget, EventBus, IEventBus } from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ScriptJobProps, IScriptJob } from './script-job';
import { addTemplateTag, DetailType } from '../utils';

// Define the LambdaScriptJob construct, which manages the execution of a Lambda function and a Step Function workflow
export class LambdaScriptJob extends Construct implements IScriptJob {
  public readonly lambdaFunction: lambda.Function; // The Lambda function that executes the script
  public readonly provisioningStateMachine: stepfunctions.StateMachine; // The Step Function state machine that orchestrates the job
  public eventTarget: IRuleTarget; // The target for the event bus, linked to the state machine
  incomingEvent: DetailType; // The incoming event that triggers the job

  // Constructor for the LambdaScriptJob construct
  constructor(scope: Construct, id: string, props: ScriptJobProps) {
    super(scope, id);
    addTemplateTag(this, 'LambdaScriptJob'); // Adds a tag to the CloudFormation template for identification

    // Get an instance of the event bus from the provided event manager
    const eventBus = EventBus.fromEventBusArn(this, 'EventBus', props.eventManager.busArn);
    this.incomingEvent = props.incomingEvent;

    // Create the Lambda function using a helper method
    this.lambdaFunction = this.createLambdaFunction(props);

    // Create the Step Function state machine using a helper method
    this.provisioningStateMachine = this.createProvisioningStateMachine(
      props,
      this.lambdaFunction,
      eventBus
    );

    // Grant permission for the state machine to put events on the event bus
    eventBus.grantPutEventsTo(this.provisioningStateMachine);

    // Define the state machine as a target for event bus rules
    this.eventTarget = new targets.SfnStateMachine(this.provisioningStateMachine);
  }

  // Helper method to create the Lambda function that executes the script
  private createLambdaFunction(props: ScriptJobProps): lambda.Function {
    // Initialize environment variables for the Lambda function
    const environmentVariables: { [key: string]: string } = {};

    // If script-specific environment variables are provided, add them to the environment
    if (props.scriptEnvironmentVariables) {
      Object.assign(environmentVariables, props.scriptEnvironmentVariables);
    }

    // Define the Lambda function with necessary properties
    const lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Runtime environment for the Lambda function
      handler: 'index.handler', // Entry point for the Lambda function
      code: lambda.Code.fromInline(`
        const { exec } = require('child_process');
        exports.handler = async (event) => {
          return new Promise((resolve, reject) => {
            exec(\`${props.script}\`, (error, stdout, stderr) => {
              if (error) {
                reject({ error: stderr });
              } else {
                resolve({ output: stdout });
              }
            });
          });
        };
      `), // Inline code for the Lambda function, which executes the provided script
      environment: environmentVariables, // Environment variables passed to the Lambda function
      timeout: cdk.Duration.minutes(15), // Maximum execution time for the Lambda function
    });

    // If custom IAM permissions are provided, attach them to the Lambda function's execution role
    if (props.permissions) {
      const policy = new iam.Policy(this, 'LambdaPolicy', {
        document: props.permissions,
      });
      // Attach the policy to the Lambda function's role
      policy.attachToRole(lambdaFunction.role!);
    }

    return lambdaFunction;
  }

  // Helper method to create the Step Function state machine that orchestrates the job execution
  private createProvisioningStateMachine(
    props: ScriptJobProps,
    jobRunnerLambdaFunction: lambda.Function,
    eventBus: IEventBus
  ): stepfunctions.StateMachine {
    // Define the event sources for success and failure scenarios
    const successEventSource = props.eventManager.supportedEvents[props.outgoingEvent.success];
    const failureEventSource = props.eventManager.supportedEvents[props.outgoingEvent.failure];
    const detailType = props.outgoingEvent;

    // Prepare environment variables that need to be passed from the incoming event to the Lambda function
    const environmentVariablesOverride: { [name: string]: stepfunctions.JsonPath } = {};

    // Map string variables from the incoming event to the Lambda function's environment
    props.environmentStringVariablesFromIncomingEvent?.forEach((importedVar: string) => {
      environmentVariablesOverride[importedVar] = stepfunctions.JsonPath.stringAt(
        `$.detail.${importedVar}`
      );
    });

    // Map JSON variables from the incoming event to the Lambda function's environment
    props.environmentJSONVariablesFromIncomingEvent?.forEach((importedVar: string) => {
      environmentVariablesOverride[importedVar] = stepfunctions.JsonPath.jsonToString(
        stepfunctions.JsonPath.objectAt(`$.detail.${importedVar}`)
      );
    });

    // Create a log group for the state machine logs, with a short retention period
    const stateMachineLogGroup = new LogGroup(this, 'stateMachineLogGroup', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete the log group when the state machine is deleted
      retention: RetentionDays.THREE_DAYS, // Retain logs for three days before deletion
      logGroupName: `/aws/vendedlogs/states/${this.node.id}-${this.node.addr}`, // Log group name
    });

    // Define a task to invoke the Lambda function within the state machine
    const startLambdaTask = new tasks.LambdaInvoke(this, 'startLambda', {
      lambdaFunction: jobRunnerLambdaFunction, // The Lambda function to invoke
      resultPath: '$.startLambda', // Path to store the result of the Lambda invocation
      payload: stepfunctions.TaskInput.fromObject({
        ...environmentVariablesOverride, // Pass the prepared environment variables to the Lambda function
      }),
    });

    // Prepare the data to be sent in the success event
    const exportedVarObj: { [key: string]: any } = {
      [props.jobIdentifierKey]: stepfunctions.JsonPath.stringAt(
        `$.detail.${props.jobIdentifierKey}`
      ),
      jobOutput: {},
    };

    // Add environment variables to be included in the outgoing event
    props.environmentVariablesToOutgoingEvent?.forEach((exportedVar: string) => {
      exportedVarObj.jobOutput[exportedVar] = stepfunctions.JsonPath.stringAt(
        `$.startLambda.Payload.output.${exportedVar}`
      );
    });

    // Define a task to send a success event to EventBridge
    const notifySuccessEventBridgeTask = new tasks.EventBridgePutEvents(
      this,
      'notifySuccessEventBridgeTask',
      {
        entries: [
          {
            detailType: detailType.success, // Detail type for the success event
            detail: stepfunctions.TaskInput.fromObject(exportedVarObj), // Event details including job output
            source: successEventSource, // Source of the success event
            eventBus: eventBus, // The event bus to send the event to
          },
        ],
        resultPath: '$.notifySuccessEventBridgeTask', // Path to store the result of the event sending
      }
    );

    // Define a task to send a failure event to EventBridge
    const notifyFailureEventBridgeTask = new tasks.EventBridgePutEvents(
      this,
      'notifyFailureEventBridgeTask',
      {
        entries: [
          {
            detailType: detailType.failure, // Detail type for the failure event
            detail: stepfunctions.TaskInput.fromObject({
              [props.jobIdentifierKey]: stepfunctions.JsonPath.stringAt(
                `$.detail.${props.jobIdentifierKey}`
              ),
              jobOutput: props.jobFailureStatus, // Include failure status in the event details
            }),
            source: failureEventSource, // Source of the failure event
            eventBus: eventBus, // The event bus to send the event to
          },
        ],
        resultPath: '$.notifyFailureEventBridgeTask', // Path to store the result of the event sending
      }
    );

    // Add a catch block to handle any errors in the Lambda invocation and trigger the failure event
    startLambdaTask.addCatch(notifyFailureEventBridgeTask, {
      errors: ['States.ALL'], // Catch all types of errors
      resultPath: '$.startLambda.Catch', // Path to store error details
    });

    // Define the sequence of steps in the state machine: start with the Lambda task and then send the success event
    const definition = startLambdaTask.next(notifySuccessEventBridgeTask);

    // Create the state machine with the defined steps and logging settings
    const provisioningStateMachine = new stepfunctions.StateMachine(
      this,
      'provisioningStateMachine',
      {
        definition, // The sequence of steps in the state machine
        timeout: cdk.Duration.hours(1), // Maximum execution time for the state machine
        logs: {
          destination: stateMachineLogGroup, // Log group for state machine logs
          level: stepfunctions.LogLevel.ALL, // Log all state transitions and errors
        },
        tracingEnabled: true, // Enable AWS X-Ray tracing for the state machine
      }
    );

    // Suppress specific IAM-related warnings for the state machine
    NagSuppressions.addResourceSuppressions(
      provisioningStateMachine,
      [
        {
          id: 'AwsSolutions-IAM5', // Suppression ID for overly broad IAM permissions
          reason: 'Suppress Resource::* created by cdk-managed StepFunction role.', // Explanation for the suppression
          appliesTo: ['Resource::*'], // Apply the suppression to any resource managed by the state machine
        },
      ],
      true // Apply the suppression to child resources as well
    );

    NagSuppressions.addResourceSuppressions(
      this.lambdaFunction,
      [
        {
          id: 'AwsSolutions-IAM5', // Suppression ID for overly broad IAM permissions
          reason: 'Suppress Resource::* possibly from the incoming policies.', // Explanation for the suppression
          appliesTo: ['Resource::*'], // Apply the suppression to any resource managed by the state machine
        },
      ],
      true // Apply the suppression to child resources as well
    );

    return provisioningStateMachine; // Return the created state machine
  }
}
