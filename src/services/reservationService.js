const { sequelize, User, Item, Reservation } = require('../models');
const logger = require('../utils/logger');
const { increment } = require('../utils/metrics');
const {
  getCachedResponse,
  cacheResponse,
  acquireProcessingLock,
  releaseProcessingLock,
  waitForCachedResponse,
} = require('./idempotencyService');

const MAX_RETRIES = Number(process.env.TRANSACTION_MAX_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.TRANSACTION_RETRY_DELAY_MS || 50);

class ReservationError extends Error {
  constructor(message, statusCode = 400, code = 'RESERVATION_ERROR') {
    super(message);
    this.name = 'ReservationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isDeadlockError(error) {
  const pgCode = error?.parent?.code || error?.original?.code;
  return pgCode === '40P01' || pgCode === '40001';
}

function isTimeoutError(error) {
  const pgCode = error?.parent?.code || error?.original?.code;
  return pgCode === '57014' || error?.message?.includes('timeout');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lockItemForUpdate(itemId, transaction) {
  const [rows] = await sequelize.query(
    'SELECT id, name, stock, price FROM items WHERE id = :itemId FOR UPDATE',
    {
      replacements: { itemId },
      transaction,
    }
  );

  if (!rows.length) {
    throw new ReservationError('Item not found', 404, 'ITEM_NOT_FOUND');
  }

  return rows[0];
}

async function lockUserForUpdate(userId, transaction) {
  const [rows] = await sequelize.query(
    'SELECT id, name, wallet_balance FROM users WHERE id = :userId FOR UPDATE',
    {
      replacements: { userId },
      transaction,
    }
  );

  if (!rows.length) {
    throw new ReservationError('User not found', 404, 'USER_NOT_FOUND');
  }

  return rows[0];
}

async function executeReservationTransaction(userId, itemId, quantity, idempotencyKey, requestId) {
  const startTime = Date.now();

  return sequelize.transaction(async (transaction) => {
    const item = await lockItemForUpdate(itemId, transaction);
    const user = await lockUserForUpdate(userId, transaction);

    const stock = Number(item.stock);
    const walletBalance = Number(user.wallet_balance);
    const price = Number(item.price);
    const totalCost = price * quantity;

    if (quantity <= 0) {
      throw new ReservationError('Quantity must be positive', 400, 'INVALID_QUANTITY');
    }

    if (stock < quantity) {
      throw new ReservationError(
        `Insufficient stock. Available: ${stock}, requested: ${quantity}`,
        409,
        'INSUFFICIENT_STOCK'
      );
    }

    if (walletBalance < totalCost) {
      throw new ReservationError(
        `Insufficient wallet balance. Available: ${walletBalance}, required: ${totalCost}`,
        402,
        'INSUFFICIENT_BALANCE'
      );
    }

    await Item.update(
      { stock: stock - quantity },
      { where: { id: itemId }, transaction }
    );

    await User.update(
      { wallet_balance: walletBalance - totalCost },
      { where: { id: userId }, transaction }
    );

    const reservation = await Reservation.create(
      {
        user_id: userId,
        item_id: itemId,
        quantity,
        status: 'confirmed',
        idempotency_key: idempotencyKey || null,
        created_at: new Date(),
      },
      { transaction }
    );

    const durationMs = Date.now() - startTime;
    logger.info('reservation_created', {
      requestId,
      reservationId: reservation.id,
      userId,
      itemId,
      quantity,
      totalCost,
      durationMs,
    });

    return {
      reservationId: reservation.id,
      userId,
      itemId,
      quantity,
      totalCost,
      status: 'confirmed',
      remainingStock: stock - quantity,
      remainingBalance: walletBalance - totalCost,
    };
  });
}

async function reserveItem({ userId, itemId, quantity, idempotencyKey, requestId }) {
  if (!userId || !itemId || !quantity) {
    throw new ReservationError('userId, itemId, and quantity are required', 400, 'VALIDATION_ERROR');
  }

  if (idempotencyKey) {
    const cached = await getCachedResponse(idempotencyKey);
    if (cached) {
      return { ...cached.body, fromCache: true, statusCode: cached.statusCode };
    }

    const lockAcquired = await acquireProcessingLock(idempotencyKey);
    if (!lockAcquired) {
      const waited = await waitForCachedResponse(idempotencyKey);
      if (waited) {
        return { ...waited.body, fromCache: true, statusCode: waited.statusCode };
      }
      throw new ReservationError(
        'Request with this idempotency key is already being processed',
        409,
        'IDEMPOTENCY_CONFLICT'
      );
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await executeReservationTransaction(userId, itemId, quantity, idempotencyKey, requestId);

      const response = { success: true, data: result };
      if (idempotencyKey) {
        await cacheResponse(idempotencyKey, 201, response);
        await releaseProcessingLock(idempotencyKey);
      }

      return { ...response, statusCode: 201 };
    } catch (error) {
      lastError = error;

      if (error.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
        const existing = await Reservation.findOne({ where: { idempotency_key: idempotencyKey } });
        if (existing) {
          const response = {
            success: true,
            data: {
              reservationId: existing.id,
              userId: existing.user_id,
              itemId: existing.item_id,
              quantity: existing.quantity,
              status: existing.status,
            },
          };
          await cacheResponse(idempotencyKey, 201, response);
          await releaseProcessingLock(idempotencyKey);
          return { ...response, statusCode: 201, fromCache: true };
        }
      }

      if (error instanceof ReservationError) {
        if (idempotencyKey) {
          const errorResponse = {
            success: false,
            error: { message: error.message, code: error.code },
          };
          await cacheResponse(idempotencyKey, error.statusCode, errorResponse);
          await releaseProcessingLock(idempotencyKey);
        }
        throw error;
      }

      if (isDeadlockError(error) && attempt < MAX_RETRIES) {
        increment('deadlockRetries');
        logger.warn('transaction_deadlock_retry', {
          requestId,
          attempt,
          maxRetries: MAX_RETRIES,
          error: error.message,
        });
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      increment('transactionFailures');
      logger.error('transaction_failed', {
        requestId,
        attempt,
        error: error.message,
        code: error?.parent?.code || error?.original?.code,
      });

      if (idempotencyKey) {
        await releaseProcessingLock(idempotencyKey);
      }

      if (isTimeoutError(error)) {
        throw new ReservationError('Database operation timed out', 504, 'DB_TIMEOUT');
      }

      throw new ReservationError('Failed to process reservation', 500, 'TRANSACTION_FAILED');
    }
  }

  if (idempotencyKey) {
    await releaseProcessingLock(idempotencyKey);
  }
  throw lastError;
}

module.exports = {
  reserveItem,
  ReservationError,
};
