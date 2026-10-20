const express = require('express');
const crypto = require('crypto');
const store = require('../store');

const router = express.Router();
const DELAY_MS = parseInt(process.env.DELAY_MS) || 0;
const FAIL_RATE = parseFloat(process.env.FAIL_RATE) || 0;
const DROP_RATE = parseFloat(process.env.DROP_RATE) || 0;

router.post('/charges', (req, res) => {
  store.stats.requests++;

  const idempotencyKey = req.headers['idempotency-key'];

  if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
    const cached = store.idempotencyKeys.get(idempotencyKey);
    console.log(`[BANK] Idempotency hit: key=${idempotencyKey}, returning cached charge`);
    return res.status(cached.statusCode).json(cached.body);
  }

  const { reference, amount } = req.body;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (amount > 20_000_000) {
    return res.status(402).json({ error: `Amount ${amount} exceeds limit of 20,000,000` });
  }

  if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) {
    console.log(`[BANK] FAIL: Returning 500 for reference=${reference} (before charging)`);
    return res.status(500).json({ error: 'Internal server error' });
  }

  const chargeId = `CHG-${crypto.randomUUID().slice(0, 8)}`;
  store.charges.set(chargeId, { chargeId, reference, amount });
  store.stats.charges++;

  if (store.chargedReferences.has(reference)) {
    store.stats.duplicates++;
    console.warn(`[BANK] ⚠️  DUPLICATE charge for reference=${reference}! duplicates=${store.stats.duplicates}`);
  }
  store.chargedReferences.add(reference);

  const responseBody = { chargeId, reference, amount };

  if (idempotencyKey) {
    store.idempotencyKeys.set(idempotencyKey, {
      statusCode: 201,
      body: responseBody,
    });
  }

  if (DROP_RATE > 0 && Math.random() < DROP_RATE) {
    console.log(`[BANK] DROP: Charged ${chargeId} (ref=${reference}) but destroying connection`);
    req.socket.destroy();
    return;
  }

  const sendResponse = () => {
    res.status(201).json(responseBody);
  };

  if (DELAY_MS > 0) {
    setTimeout(sendResponse, DELAY_MS);
  } else {
    sendResponse();
  }
});


router.get('/stats', (_req, res) => {
  res.json(store.stats);
});

module.exports = router;
