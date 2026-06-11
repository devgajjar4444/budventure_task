const { sequelize } = require('../models');
const { snapshot } = require('../utils/metrics');
const { getRedisClient } = require('../services/redisClient');

async function getMetrics(req, res) {
  const appMetrics = snapshot();

  let dbPool = {};
  try {
    const pool = sequelize.connectionManager.pool;
    if (pool) {
      dbPool = {
        size: pool.size,
        available: pool.available,
        using: pool.using,
        waiting: pool.waiting,
      };
    }
  } catch {
    dbPool = { error: 'unable to read pool stats' };
  }

  let redisStatus = 'unknown';
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    redisStatus = pong === 'PONG' ? 'connected' : 'degraded';
  } catch {
    redisStatus = 'disconnected';
  }

  res.json({
    timestamp: new Date().toISOString(),
    application: appMetrics,
    database: {
      pool: dbPool,
      dialect: 'postgres',
      viaPgBouncer: true,
    },
    redis: {
      status: redisStatus,
    },
  });
}

module.exports = { getMetrics };
