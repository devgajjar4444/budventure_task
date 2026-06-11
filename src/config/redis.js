require('dotenv').config();

module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 3,
  keyPrefix: 'grocery:',
};
