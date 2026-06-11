const { getRedisClient } = require('./redisClient');
const logger = require('../utils/logger');
const { increment } = require('../utils/metrics');

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
const LOCK_TTL_SECONDS = 30;

function cacheKey(idempotencyKey) {
  return `idempotency:${idempotencyKey}`;
}

function lockKey(idempotencyKey) {
  return `idempotency-lock:${idempotencyKey}`;
}

async function getCachedResponse(idempotencyKey) {
  if (!idempotencyKey) return null;

  const redis = getRedisClient();
  const cached = await redis.get(cacheKey(idempotencyKey));
  if (!cached) return null;

  increment('idempotencyHits');
  logger.info('idempotency_cache_hit', { idempotencyKey });
  return JSON.parse(cached);
}

async function cacheResponse(idempotencyKey, statusCode, body) {
  if (!idempotencyKey) return;

  const redis = getRedisClient();
  const payload = JSON.stringify({ statusCode, body });
  await redis.set(cacheKey(idempotencyKey), payload, 'EX', IDEMPOTENCY_TTL_SECONDS);
}

async function acquireProcessingLock(idempotencyKey) {
  if (!idempotencyKey) return true;

  const redis = getRedisClient();
  const result = await redis.set(lockKey(idempotencyKey), '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

async function releaseProcessingLock(idempotencyKey) {
  if (!idempotencyKey) return;

  const redis = getRedisClient();
  await redis.del(lockKey(idempotencyKey));
}

async function waitForCachedResponse(idempotencyKey, maxAttempts = 20, delayMs = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const cached = await getCachedResponse(idempotencyKey);
    if (cached) return cached;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

module.exports = {
  getCachedResponse,
  cacheResponse,
  acquireProcessingLock,
  releaseProcessingLock,
  waitForCachedResponse,
};
