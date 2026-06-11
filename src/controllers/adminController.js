const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function resetFlashSale(req, res) {
  if (process.env.DISABLE_DEMO_RESET === 'true') {
    return res.status(403).json({ success: false, error: 'Demo reset is disabled' });
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('DELETE FROM reservations', { transaction });

    await sequelize.query(
      `UPDATE users SET wallet_balance = CASE id
         WHEN 1 THEN 500.00 WHEN 2 THEN 200.00 WHEN 3 THEN 50.00
         WHEN 4 THEN 1000.00 WHEN 5 THEN 75.00
       END
       WHERE id IN (1, 2, 3, 4, 5)`,
      { transaction }
    );

    await sequelize.query(
      `UPDATE items SET
         stock = CASE id WHEN 101 THEN 5 WHEN 102 THEN 100 WHEN 103 THEN 30 END,
         price = CASE id WHEN 101 THEN 4.99 WHEN 102 THEN 3.49 WHEN 103 THEN 6.99 END
       WHERE id IN (101, 102, 103)`,
      { transaction }
    );
  });

  logger.info('demo_data_reset', { requestId: req.requestId });

  res.json({ success: true, message: 'Demo data reset to seed values' });
}

module.exports = { resetFlashSale };
