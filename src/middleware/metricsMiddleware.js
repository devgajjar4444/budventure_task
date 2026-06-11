const { increment, recordResponseTime } = require('../utils/metrics');

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') {
    return next();
  }

  const start = Date.now();
  increment('activeRequests');
  increment('requestsTotal');

  res.on('finish', () => {
    const duration = Date.now() - start;
    recordResponseTime(duration);
    increment('activeRequests', -1);

    if (res.statusCode >= 400) {
      increment('requestsFailed');
    } else {
      increment('requestsSuccess');
    }
  });

  next();
}

module.exports = metricsMiddleware;
