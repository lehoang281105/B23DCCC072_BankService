const http = require('http');
const crypto = require('crypto');

const BANK_URL = process.env.BANK_URL || 'http://localhost:4002';
const bankUrl = new URL(BANK_URL);

const TOTAL_TIMEOUT_MS = 4000;
const MAX_RETRIES = 3;

const bankAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  keepAliveMsecs: 1000,
});

// ─── Low-level HTTP call to bank ─────────────────────────────────
/**
 * Gọi POST /charges tới ngân hàng
 * @param {string} reference - Payment ID (e.g. P1, P2)
 * @param {number} amount - Số tiền
 * @param {string} idempotencyKey - UUID duy nhất cho mỗi payment
 * @param {number} timeoutMs - Thời gian timeout cho request này
 * @returns {Promise<{statusCode: number, body: object}>}
 */
function callBank(reference, amount, idempotencyKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ reference, amount });

    const req = http.request(
      {
        hostname: bankUrl.hostname,
        port: bankUrl.port || 80,
        path: '/charges',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Idempotency-Key': idempotencyKey,
        },
        agent: bankAgent,
      },
    );

    // ── Settle helper: ensure resolve/reject only once ──
    let settled = false;
    const settle = (fn, val) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn(val);
      }
    };

    // ── Overall timeout (Tình huống 2) ──
    const timer = setTimeout(() => {
      settle(reject, Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' }));
      req.destroy();
    }, timeoutMs);

    // ── Request error (Tình huống 1: ECONNREFUSED, Tình huống 4: ECONNRESET) ──
    req.on('error', (err) => settle(reject, err));

    // ── Response handling ──
    req.on('response', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          settle(resolve, { statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          settle(resolve, { statusCode: res.statusCode, body: { error: 'Invalid response from bank' } });
        }
      });
      res.on('error', (err) => settle(reject, err));
    });

    req.write(body);
    req.end();
  });
}

// ─── High-level charge with retry (Tình huống 4) ─────────────────
/**
 * Gọi ngân hàng với retry + idempotency + exponential backoff
 *
 * Quy tắc retry:
 * - ECONNREFUSED → KHÔNG retry (bank đang tắt)
 * - 4xx (400, 402) → KHÔNG retry (lỗi nghiệp vụ)
 * - 5xx (500) → retry (lỗi tạm thời, chưa trừ tiền)
 * - Socket error / timeout → retry (có thể đã trừ tiền, dùng Idempotency-Key)
 *
 * @param {string} reference - Payment ID
 * @param {number} amount - Số tiền
 * @returns {Promise<{type: string, statusCode?: number, body?: object, error?: string}>}
 */
async function chargeWithRetry(reference, amount) {
  const idempotencyKey = crypto.randomUUID();
  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const elapsed = Date.now() - startTime;
    const remaining = TOTAL_TIMEOUT_MS - elapsed;

    if (remaining <= 100) break;

    if (attempt > 0) {
      const backoff = Math.min(200 * Math.pow(2, attempt - 1), remaining - 100);
      if (backoff > 0) {
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    const remaining2 = TOTAL_TIMEOUT_MS - (Date.now() - startTime);
    if (remaining2 <= 0) break;

    try {
      const result = await callBank(reference, amount, idempotencyKey, remaining2);

      if (result.statusCode === 201) {
        return { type: 'PAID', statusCode: 201, body: result.body };
      }

      if (result.statusCode >= 400 && result.statusCode < 500) {
        return { type: 'FAILED', statusCode: result.statusCode, body: result.body };
      }

      lastError = result.body?.error || `Bank returned ${result.statusCode}`;
      continue;

    } catch (err) {
      lastError = err.message;

      if (err.code === 'ECONNREFUSED') {
        return { type: 'CONN_REFUSED', error: err.message };
      }

      continue;
    }
  }

  return { type: 'PENDING', error: lastError || 'All retries exhausted' };
}

module.exports = { chargeWithRetry };
