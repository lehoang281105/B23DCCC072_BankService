const app = require('./src/app');
const store = require('./src/store');

const PORT = process.env.PORT || 4002;

const server = app.listen(PORT, () => {
  console.log(`[BANK] 🏦 Running on port ${PORT}`);
  console.log(`[BANK] Config: DELAY_MS=${process.env.DELAY_MS || 0}, FAIL_RATE=${process.env.FAIL_RATE || 0}, DROP_RATE=${process.env.DROP_RATE || 0}`);
});

server.on('connection', (socket) => {
  store.stats.connections++;
  console.log(`[BANK] 🔌 New TCP connection #${store.stats.connections} from ${socket.remoteAddress}:${socket.remotePort}`);
});

server.keepAliveTimeout = 5000;
