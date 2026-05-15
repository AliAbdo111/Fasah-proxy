require('dotenv').config();
require('./polyfillWebCrypto');
const express = require('express');
const cors = require('cors');
const fasahRoutes = require('./routes/fasahRoutes');
const zatcaCompatRoutes = require('./routes/zatcaCompatRoutes');
const zatcaCompatRoutesV1 = require('./routes/zatcaCompatRoutesV1');
const zatcaTasV2Routes = require('./routes/zatcaTasV2Routes');
const zatcaTasCustomsRoutes = require('./routes/zatcaTasCustomsRoutes');
const zatcaFleetCompatRoutes = require('./routes/zatcaFleetCompatRoutes');
const zatcaFleetV1Routes = require('./routes/zatcaFleetV1Routes');
const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3001;
const loggerService = require('./services/loggerSerivce');
const socketService = require('./services/socketService');
const path = require('path');
const http = require('http');
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin HTML must be registered before express.static so HTML is not served from static with default caching
function sendLoginPage(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
}
app.get('/login', sendLoginPage);
app.get('/login.html', sendLoginPage);
function sendUsersAdminPage(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
}
app.get('/users', sendUsersAdminPage);
app.get('/users.html', sendUsersAdminPage);
function sendSocketTestPage(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'socket-test.html'));
}
app.get('/socket-test', sendSocketTestPage);
app.get('/socket-test.html', sendSocketTestPage);

app.use(express.static(path.join(__dirname, 'public')));

const db = mongoose.connection;
let mongoHasConnected = false;
db.on('error', (err) => {
  // First ECONNREFUSED is already logged by mongoose.connect().catch — skip duplicate line
  if (!mongoHasConnected && String(err.message || '').includes('ECONNREFUSED')) {
    return;
  }
  console.error('MongoDB connection error:', err.message);
});
db.once('open', () => {
  mongoHasConnected = true;
  console.log('Connected to MongoDB');
});

// Do not crash the API if MongoDB is temporarily unreachable
mongoose.connect(process.env.MONGO_URI).catch((err) => {
  console.error('MongoDB initial connection failed:', err.message);
  console.error('Server will continue running without DB until MongoDB is reachable.');
  console.error('Tip: run Mongo locally (e.g. docker compose up -d) or set MONGO_URI to your cluster.');
});

app.get('/schedule', async (req, res) => {
  const schedule = await Schedule.find();
  res.json(schedule);
});

app.get('/loggers', async (req, res) => {
  const loggers = await loggerService.getLoggers();
  res.json(loggers);
});

const dailyBookingResetCron = require('./services/dailyBookingResetCron');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FASAH Proxy',
    timestamp: new Date().toISOString()
  });
});

// API Routes (FASAH requires auth)
app.use('/api/fasah', authMiddleware, fasahRoutes);
// ZATCA-compatible path: same URL and params as ZATCA (e.g. type=IMPORT)
app.use('/api/zatca', authMiddleware, zatcaCompatRoutes);
app.use('/api/zatca-tas/v1', authMiddleware, zatcaCompatRoutesV1);
app.use('/api/zatca-tas/v2', authMiddleware, zatcaTasV2Routes);
app.use('/api/zatca-tas/customs', authMiddleware, zatcaTasCustomsRoutes);
app.use('/api/zatca-fleet/v1', authMiddleware, zatcaFleetV1Routes);
app.use('/api/zatca-fleet/v2', authMiddleware, zatcaFleetCompatRoutes);
app.use('/api/auth', authRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// HTTP + Socket.IO (Socket.IO lives in services/socketService.js)
const server = http.createServer(app);
socketService.attachToHttpServer(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FASAH Proxy Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api/fasah`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    // بدء Cron Job تلقائياً عند تشغيل السيرفر (اختياري)
      // scheduleCron.startCronJob();
  dailyBookingResetCron.start();
});

module.exports = app;

