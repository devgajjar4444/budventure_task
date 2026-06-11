require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 6432),
  database: process.env.DB_NAME || 'grocery_db',
  username: process.env.DB_USER || 'grocery_user',
  password: process.env.DB_PASSWORD || 'grocery_pass',
  dialect: 'postgres',
  logging: process.env.LOG_LEVEL === 'debug' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  // Do not set statement_timeout here — PgBouncer rejects it as a startup parameter.
  // Query timeouts are enforced by PgBouncer (query_timeout in pgbouncer.ini).
  dialectOptions: {},
};

module.exports = config;
