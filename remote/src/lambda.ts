import { once } from 'node:events';
import type { Context, LambdaFunctionURLEvent } from 'aws-lambda';
import remoteApp from './index.js';

interface LambdaResponseStream extends NodeJS.WritableStream {
  write(chunk: Uint8Array | Buffer | string): boolean;
  end(): this;
}

declare const awslambda: {
  HttpResponseStream: {
    from(
      stream: LambdaResponseStream,
      metadata: {
        statusCode: number;
        headers?: Record<string, string>;
        cookies?: string[];
      },
    ): LambdaResponseStream;
  };
  streamifyResponse(
    handler: (
      event: LambdaFunctionURLEvent,
      responseStream: LambdaResponseStream,
      context: Context,
    ) => Promise<void>,
  ): unknown;
};

function runtimeEnv() {
  return {
    BNDY_API_BASE_URL: process.env.BNDY_API_BASE_URL ?? 'https://api.bndy.co.uk',
    BNDY_MCP_SERVICE_TOKEN: process.env.BNDY_MCP_SERVICE_TOKEN ?? '',
    BNDY_REMOTE_MCP_TOKEN: process.env.BNDY_REMOTE_MCP_TOKEN ?? '',
  };
}

function requestFromEvent(event: LambdaFunctionURLEvent): Request {
  const method = event.requestContext.http.method;
  const headers = new Headers();

  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers.set(name, value);
  }

  if (event.cookies?.length) {
    headers.set('cookie', event.cookies.join('; '));
  }

  const protocol = event.headers?.['x-forwarded-proto'] ?? 'https';
  const host = event.headers?.host ?? 'localhost';
  const path = event.rawPath || '/';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = `${protocol}://${host}${path}${query}`;

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD' && event.body !== undefined && event.body !== null) {
    body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
  }

  return new Request(url, { method, headers, body });
}

function responseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return headers;
}

async function writeChunk(stream: LambdaResponseStream, chunk: Uint8Array): Promise<void> {
  if (!stream.write(Buffer.from(chunk))) {
    await once(stream, 'drain');
  }
}

async function streamWebResponse(
  response: Response,
  rawResponseStream: LambdaResponseStream,
): Promise<void> {
  const responseStream = awslambda.HttpResponseStream.from(rawResponseStream, {
    statusCode: response.status,
    headers: responseHeaders(response),
  });

  if (!response.body) {
    responseStream.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writeChunk(responseStream, value);
    }
  } finally {
    reader.releaseLock();
    responseStream.end();
  }
}

async function handle(
  event: LambdaFunctionURLEvent,
  responseStream: LambdaResponseStream,
  context: Context,
): Promise<void> {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const request = requestFromEvent(event);
    const response = await remoteApp.fetch(request, runtimeEnv());
    await streamWebResponse(response, responseStream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Remote MCP Lambda request failed', { message });

    await streamWebResponse(
      Response.json(
        { error: 'Internal server error' },
        { status: 500 },
      ),
      responseStream,
    );
  }
}

export const handler = awslambda.streamifyResponse(handle);
