const Redis = require('ioredis');
const redisConfig = require('../config/redis');
const logger = require('../utils/logger');

let client = null;

function getRedisClient() {
  if (!client) {
    const { keyPrefix, ...connection } = redisConfig;
    client = new Redis({
      host: connection.host,
      port: connection.port,
      maxRetriesPerRequest: connection.maxRetriesPerRequest,
      keyPrefix,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    client.on('error', (err) => {
      logger.error('redis_connection_error', { error: err.message });
    });

    client.on('ready', () => {
      logger.info('redis_connected', { host: connection.host, port: connection.port });
    });
  }
  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  await redis.ping();
  return redis;
}

module.exports = { getRedisClient, connectRedis };
