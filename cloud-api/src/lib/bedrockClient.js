/**
 * Amazon Bedrock injection seam.
 *
 * This module holds the model-inference network path (quotas use DynamoDB separately). Handlers are authored as
 * makeHandler({ invokeModel }); the Lambda entry wires `invokeModel` from here,
 * while tests inject a stub (test/helpers/fakeBedrock.js). Tests must never
 * import this module, so the AWS SDK is loaded lazily and only on first real use.
 *
 * invokeModel({ system, messages }) -> Promise<string> returns the model's raw
 * text output. The caller is responsible for parsing/validating that text.
 */

let clientPromise = null;

/**
 * Lazily construct a BedrockRuntimeClient. The AWS SDK is imported on demand so
 * that importing this file never triggers SDK/network initialization.
 *
 * @returns {Promise<import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient>}
 */
export function createBedrockClient() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-bedrock-runtime').then(
      ({ BedrockRuntimeClient }) =>
        new BedrockRuntimeClient({ region: process.env.AWS_REGION, maxAttempts: 1 }),
    );
  }
  return clientPromise;
}

/**
 * Build an invokeModel bound to a lazily-created real Bedrock client.
 *
 * Uses the Anthropic Claude messages format against process.env.BEDROCK_MODEL_ID.
 *
 * @returns {(args: { system?: string, messages: Array<{ role: string, content: string }> }) => Promise<string>}
 */
export function createInvokeModel() {
  return async function invokeModel({ system, messages }) {
    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = await createBedrockClient();

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ type: 'text', text: m.content }],
      })),
    };
    if (system) payload.system = system;

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await client.send(command, { abortSignal: AbortSignal.timeout(12000) });
    const decoded = JSON.parse(new TextDecoder().decode(response.body));
    const text = Array.isArray(decoded?.content)
      ? decoded.content.map((part) => part?.text ?? '').join('')
      : '';
    return text;
  };
}

/**
 * Default invokeModel bound to a lazily-created client. Importing this binding
 * does not construct the client; the client is created on first invocation.
 */
export const invokeModel = createInvokeModel();
