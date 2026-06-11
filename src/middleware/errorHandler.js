const logger = require('../utils/logger');
const { ReservationError } = require('../services/reservationService');

function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || 'unknown';

  if (err instanceof ReservationError) {
    logger.warn('api_error', {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      requestId,
    });
  }

  logger.error('unhandled_error', {
    requestId,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    requestId,
  });
}

module.exports = errorHandler;
