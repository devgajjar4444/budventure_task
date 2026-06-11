require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { connectRedis } = require('./services/redisClient');
const logger = require('./utils/logger');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_DB_RETRIES = 10;
const DB_RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDatabase() {
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      await sequelize.authenticate();
      logger.info('database_connected', {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        attempt,
      });
      return;
    } catch (error) {
      logger.warn('database_connect_retry', {
        attempt,
        maxRetries: MAX_DB_RETRIES,
        error: error.message,
      });
      if (attempt === MAX_DB_RETRIES) throw error;
      await sleep(DB_RETRY_DELAY_MS);
    }
  }
}

async function start() {
  try {
    await connectDatabase();
    await connectRedis();

    app.listen(PORT, HOST, () => {
      logger.info('server_started', { host: HOST, port: PORT, env: process.env.NODE_ENV || 'development' });
    });
  } catch (error) {
    logger.error('server_startup_failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

start();
