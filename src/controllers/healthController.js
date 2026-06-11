const { sequelize } = require('../models');
const { getRedisClient } = require('../services/redisClient');

async function healthCheck(req, res) {
  const checks = { database: 'unknown', redis: 'unknown' };

  try {
    await sequelize.authenticate();
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    checks.redis = 'healthy';
  } catch {
    checks.redis = 'unhealthy';
  }

  const healthy = Object.values(checks).every((v) => v === 'healthy');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    requestId: req.requestId,
  });
}

module.exports = { healthCheck };
