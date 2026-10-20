const express = require('express');
const { getStudentFees, createPayment } = require('../services/payment.service');

const router = express.Router();


router.get('/students/:id/fees', (req, res) => {
  const id = parseInt(req.params.id);
  const data = getStudentFees(id);

  if (!data) {
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json(data);
});

router.post('/students/:id/payments', async (req, res) => {
  const id = parseInt(req.params.id);
  const { amount } = req.body;

  try {
    const result = await createPayment(id, amount);
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    console.error(`[FEE] Unexpected error for student ${id}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
