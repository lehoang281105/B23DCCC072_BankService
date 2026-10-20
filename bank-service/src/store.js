const stats = {
  connections: 0,
  requests: 0,
  charges: 0,
  duplicates: 0,
};

const charges = new Map();

const idempotencyKeys = new Map();

const chargedReferences = new Set();

module.exports = { stats, charges, idempotencyKeys, chargedReferences };
