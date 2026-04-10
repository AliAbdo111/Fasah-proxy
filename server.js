require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Schedule = require('./routes/models/Schedule');
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
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const ScheduleCron = require('./services/scheduleCron'); // الجديد

const scheduleCron = new ScheduleCron();

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'FASAH Proxy API',
    version: '1.0.0',
    description: 'Proxy service for FASAH schedule management API',
    endpoints: {
      health: '/health',
      schedule: '/api/fasah/schedule/land',
      zatcaScheduleLand: 'GET /api/zatca/zone/schedule/land/server-one?departure=&arrival=&type=',
      zatcaLandAppointmentCreate: 'POST /api/zatca-tas/v2/appointment/land/create',
      zatcaBulkGetDeclarationInfo:
        'GET /api/zatca-tas/v2/appointment/bulk/getDeclarationInfo?decNo=&port=&purpose=&toRefNo=',
      zatcaTasCustomsDriverTruckInfo:
        'GET /api/zatca-tas/customs/forigen/driver-truck-info?purpose=&consignmentNumber=',
      zatcaLandAppointmentPdf: 'GET /api/zatca-tas/v1/appoint/pdf/generateLand?ref=',
      zatcaFleetResidentCountries: 'GET /api/zatca-fleet/v1/lookup/resident/countries',
      zatcaFleetNationality: 'GET /api/zatca-fleet/v1/nationality',
      zatcaFleetTruckColors: 'GET /api/zatca-fleet/v1/lookup/truck/colors?q=',
      zatcaFleetV2TruckBrands: 'GET /api/zatca-fleet/v2/truck/lookup/brands?q=',
      zatcaFleetV2TruckModels: 'GET /api/zatca-fleet/v2/truck/lookup/models/:brandCode?q=',
      scheduleImport: 'GET /api/fasah/schedule/land?type=IMPORT',
      scheduleEmptyTruck: 'GET /api/fasah/schedule/land?type=EMPTY_TRUCK',
      getDeclarationInfo: 'GET /api/fasah/appointment/transit/getDeclarationInfo?decNo=&arrivalPort=',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password',
        verifyOtp: 'POST /api/auth/verify-otp',
        resendOtp: 'POST /api/auth/resend-otp',
        me: 'GET /api/auth/me',
        activateUser: 'PATCH /api/auth/users/:userId/activate',
        deactivateUser: 'PATCH /api/auth/users/:userId/deactivate'
      }
    }
  });
});

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FASAH Proxy Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api/fasah`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    // بدء Cron Job تلقائياً عند تشغيل السيرفر (اختياري)
      // scheduleCron.startCronJob();
    
});

module.exports = app;

