require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Schedule = require('./routes/models/Schedule');
const fasahRoutes = require('./routes/fasahRoutes');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect('mongodb+srv://Aliomran_11:aliomran11@bookstore.2p8vi6j.mongodb.net/?retryWrites=true&w=majority&appName=fasah-proxy');
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

app.get('/schedule', async (req, res) => {
  const schedule = await Schedule.find();
  res.json(schedule);
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

// API Routes
app.use('/api/fasah', fasahRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'FASAH Proxy API',
    version: '1.0.0',
    description: 'Proxy service for FASAH schedule management API',
    endpoints: {
      health: '/health',
      schedule: '/api/fasah/schedule/land'
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

