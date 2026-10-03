import { ApiError, CODES } from './errors.js';

let client;
/** Atomic per-user daily allowance, shared across all AI routes. TTL cleans old rows. */
export async function enforceQuota(event, { send, now = new Date(), env = process.env } = {}) {
  if (!env.QUOTA_TABLE) return; // Local tests have no AWS configuration.
  const subject = event?.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!subject) throw new ApiError(401, CODES.UNAUTHORIZED, 'Sign in to use cloud AI');
  const day = now.toISOString().slice(0, 10);
  const limit = Number(env.DAILY_REQUEST_LIMIT ?? 20);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid quota configuration');
  try {
    const input = {
      TableName: env.QUOTA_TABLE,
      Key: { pk: { S: `${subject}:${day}` } },
      UpdateExpression: 'SET expiresAt = :ttl ADD requests :one',
      ConditionExpression: 'attribute_not_exists(requests) OR requests < :limit',
      ExpressionAttributeValues: {
        ':ttl': { N: String(Math.floor(now.getTime() / 1000) + 172800) },
        ':one': { N: '1' }, ':limit': { N: String(limit) },
      },
    };
    if (send) await send(input); // Test seam: never contact AWS during unit tests.
    else {
      const { DynamoDBClient, UpdateItemCommand } = await import('@aws-sdk/client-dynamodb');
      client ??= new DynamoDBClient({ region: env.AWS_REGION, maxAttempts: 1 });
      await client.send(new UpdateItemCommand(input), { abortSignal: AbortSignal.timeout(2000) });
    }
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new ApiError(429, CODES.QUOTA_EXCEEDED, 'Daily AI allowance reached. Try again tomorrow or use offline mode.');
    }
    throw error; // Fail closed if the quota service is unavailable.
  }
}
