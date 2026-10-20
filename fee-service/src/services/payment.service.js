const { chargeWithRetry } = require('../utils/bank-client');

const students = new Map([
  [1, { name: 'Nguyen Van A', fee: 50_000_000 }],
  [2, { name: 'Tran Thi B', fee: 0 }],
  [3, { name: 'Le Van C', fee: 3_200_000 }],
]);

const payments = []; // { id, studentId, amount, status, chargeId? }
let paymentCounter = 0;

function getStudentFees(studentId) {
  const student = students.get(studentId);
  if (!student) return null;
  return { studentId, name: student.name, fee: student.fee };
}


async function createPayment(studentId, amount) {
  const student = students.get(studentId);

  if (!student) {
    return { statusCode: 404, body: { error: 'Student not found' } };
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return { statusCode: 400, body: { error: 'Invalid amount' } };
  }

  if (amount > student.fee) {
    return {
      statusCode: 400,
      body: { error: `Amount ${amount} exceeds outstanding fee ${student.fee}` },
    };
  }

  paymentCounter++;
  const paymentId = `P${paymentCounter}`;
  const payment = { id: paymentId, studentId, amount, status: 'PROCESSING' };
  payments.push(payment);

  const result = await chargeWithRetry(paymentId, amount);

  switch (result.type) {
    case 'PAID':
      payment.status = 'PAID';
      payment.chargeId = result.body.chargeId;
      student.fee -= amount;
      return {
        statusCode: 201,
        body: {
          paymentId,
          status: 'PAID',
          chargeId: result.body.chargeId,
          amount,
          remainingFee: student.fee,
        },
      };

    case 'FAILED':
      payment.status = 'FAILED';
      return {
        statusCode: result.statusCode,
        body: {
          error: result.body?.error || 'Payment failed',
          paymentId,
          status: 'FAILED',
        },
      };

    case 'CONN_REFUSED':
      payment.status = 'FAILED';
      return {
        statusCode: 503,
        body: {
          error: 'Bank service unavailable',
          paymentId,
          status: 'FAILED',
        },
      };

    case 'PENDING':
    default:
      payment.status = 'PENDING';
      return {
        statusCode: 504,
        body: {
          error: result.error || 'Payment status unknown',
          paymentId,
          status: 'PENDING',
        },
      };
  }
}

module.exports = { getStudentFees, createPayment };
