const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

// Initialize client
const client = new FasahClient();

/**
 * GET /api/fasah/schedule/land
 * Get land zone schedule (المواعيد)
 * 
 * Query Parameters:
 * - departure (required): Departure code (e.g., AGF)
 * - arrival (required): Arrival zone code (e.g., 31)
 * - type (required): Schedule type (e.g., TRANSIT)
 * - economicOperator (optional): Economic operator code
 * - userType (optional): 'broker' or 'transporter' (default: 'broker')
 * 
 * Headers:
 * - x-fasah-token or Authorization: Bearer token for authentication
 */
router.get('/schedule/land', async (req, res) => {
  try {
    const { departure, arrival, type, economicOperator, userType } = req.query;
    
    // Get token from header (x-fasah-token) or Authorization header
    const token = req.headers['x-fasah-token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required. Provide token via x-fasah-token header or Authorization header.',
        error: 'Missing authentication token'
      });
    }

    const result = await client.getLandSchedule({
      departure,
      arrival,
      type,
      economicOperator,
      token,
      userType: userType || 'broker'
    });

    // Check if the response indicates no schedules available
    if (result?.success === false && result.errors) {
      return res.status(200).json({
        success: false,
        data: result
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.log(error);
    res.status(status).json({
      success: false,
      message: 'Failed to retrieve schedule',
      error: error.message,
      ...(error.data && { details: error.data })
    });
  }
});

// 404 Handler
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'FASAH endpoint not found'
  });
});

// Error handler
router.use((err, req, res, next) => {
  console.error('FASAH API Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;

