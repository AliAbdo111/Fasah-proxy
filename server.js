require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const fasahRoutes = require('./routes/fasahRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



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
});

module.exports = app;

