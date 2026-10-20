const express = require('express');
const studentRoutes = require('./routes/student.routes');

const app = express();

app.use(express.json());
app.use(studentRoutes);

module.exports = app;
