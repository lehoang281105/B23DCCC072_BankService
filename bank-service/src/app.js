const express = require('express');
const chargeRoutes = require('./routes/charge.routes');

const app = express();

app.use(express.json());
app.use(chargeRoutes);

module.exports = app;
