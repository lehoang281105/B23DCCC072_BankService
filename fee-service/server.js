const app = require('./src/app');

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`[FEE] 🎓 Running on port ${PORT}`);
  console.log(`[FEE] Bank URL: ${process.env.BANK_URL || 'http://localhost:4002'}`);
});
