const responseTimes = [];
const MAX_SAMPLES = 1000;

const metrics = {
  requestsTotal: 0,
  requestsSuccess: 0,
  requestsFailed: 0,
  transactionFailures: 0,
  deadlockRetries: 0,
  idempotencyHits: 0,
  activeRequests: 0,
};

function recordResponseTime(durationMs) {
  responseTimes.push(durationMs);
  if (responseTimes.length > MAX_SAMPLES) {
    responseTimes.shift();
  }
}

function getAverageResponseTime() {
  if (responseTimes.length === 0) return 0;
  const sum = responseTimes.reduce((a, b) => a + b, 0);
  return Math.round((sum / responseTimes.length) * 100) / 100;
}

function getPercentile(p) {
  if (responseTimes.length === 0) return 0;
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function increment(metric, amount = 1) {
  if (Object.prototype.hasOwnProperty.call(metrics, metric)) {
    metrics[metric] += amount;
  }
}

function snapshot() {
  return {
    ...metrics,
    averageResponseTimeMs: getAverageResponseTime(),
    p95ResponseTimeMs: getPercentile(95),
    p99ResponseTimeMs: getPercentile(99),
    responseTimeSamples: responseTimes.length,
  };
}

module.exports = {
  metrics,
  increment,
  recordResponseTime,
  snapshot,
};
