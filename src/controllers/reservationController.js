const { reserveItem } = require('../services/reservationService');
const logger = require('../utils/logger');

async function reserveItemHandler(req, res, next) {
  try {
    const { userId, itemId, quantity } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    logger.info('reserve_item_request', {
      requestId: req.requestId,
      userId,
      itemId,
      quantity,
      idempotencyKey: idempotencyKey || null,
    });

    const result = await reserveItem({
      userId: Number(userId),
      itemId: Number(itemId),
      quantity: Number(quantity),
      idempotencyKey,
      requestId: req.requestId,
    });

    const statusCode = result.statusCode || 201;
    const { statusCode: _, fromCache, ...body } = result;

    if (fromCache) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }

    return res.status(statusCode).json({ ...body, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
}

module.exports = { reserveItemHandler };
