import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const successRate = new Rate('reservation_success');
const stockConflict = new Counter('stock_conflicts');
const balanceConflict = new Counter('balance_conflicts');

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '30s',
    },
  },
  thresholds: {
    reservation_success: ['rate>0'],
    http_req_duration: ['p(95)<5000'],
  },
};

export function setup() {
  http.post(`${BASE_URL}/admin/reset-flash-sale`, null, { tags: { name: 'reset' } }).status;
  return { itemId: 101 };
}

export default function (data) {
  const userId = (__VU % 5) + 1;
  const payload = JSON.stringify({
    userId,
    itemId: data.itemId,
    quantity: 1,
  });

  const res = http.post(`${BASE_URL}/reserve-item`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `load-${__VU}-${__ITER}`,
    },
    tags: { name: 'reserve-item' },
  });

  const ok = check(res, {
    'status is 201 or 409 or 402': (r) => [201, 409, 402].includes(r.status),
  });

  successRate.add(res.status === 201);

  if (res.status === 409) {
    stockConflict.add(1);
  }
  if (res.status === 402) {
    balanceConflict.add(1);
  }

  sleep(0.01);
}

export function teardown() {
  const metrics = http.get(`${BASE_URL}/metrics`);
  if (metrics.status === 200) {
    console.log('Final metrics:', metrics.body);
  }
}
