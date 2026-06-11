const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

sequelize.addHook('beforeQuery', (options) => {
  options.benchmark = true;
});

sequelize.addHook('afterQuery', (options, timing) => {
  if (timing !== undefined) {
    logger.debug('query_executed', {
      sql: options.sql?.substring(0, 200),
      durationMs: timing,
    });
  }
});

const db = {
  sequelize,
  Sequelize,
  User: require('./user')(sequelize, Sequelize.DataTypes),
  Item: require('./item')(sequelize, Sequelize.DataTypes),
  Reservation: require('./reservation')(sequelize, Sequelize.DataTypes),
};

db.User.hasMany(db.Reservation, { foreignKey: 'user_id' });
db.Reservation.belongsTo(db.User, { foreignKey: 'user_id' });
db.Item.hasMany(db.Reservation, { foreignKey: 'item_id' });
db.Reservation.belongsTo(db.Item, { foreignKey: 'item_id' });

module.exports = db;
