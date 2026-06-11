require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'grocery_user',
    password: process.env.DB_PASSWORD || 'grocery_pass',
    database: process.env.DB_NAME || 'grocery_db',
    host: process.env.DB_MIGRATE_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_MIGRATE_PORT || process.env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: false,
  },
  production: {
    username: process.env.DB_USER || 'grocery_user',
    password: process.env.DB_PASSWORD || 'grocery_pass',
    database: process.env.DB_NAME || 'grocery_db',
    host: process.env.DB_MIGRATE_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_MIGRATE_PORT || process.env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: false,
  },
};
