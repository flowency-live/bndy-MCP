// AWS Lambda Client Wrapper

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const REGION = process.env.AWS_REGION || 'eu-west-2';

export const lambdaClient = new LambdaClient({ region: REGION });

/**
 * Invoke a Lambda function and parse the response
 */
export async function invokeLambda<T = any>(
  functionName: string,
  payload: any
): Promise<T> {
  const encoder = new TextEncoder();
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: encoder.encode(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(command);

  if (!response.Payload) {
    throw new Error('No payload returned from Lambda');
  }

  const payloadString = new TextDecoder().decode(response.Payload);
  const lambdaResponse = JSON.parse(payloadString);

  // Check for Lambda errors
  if (lambdaResponse.statusCode >= 400) {
    const errorBody = JSON.parse(lambdaResponse.body);
    throw new Error(`Lambda error ${lambdaResponse.statusCode}: ${errorBody.error || errorBody.message}`);
  }

  // Parse and return body
  return JSON.parse(lambdaResponse.body);
}
