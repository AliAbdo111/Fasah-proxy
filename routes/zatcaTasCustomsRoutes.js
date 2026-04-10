const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

const client = new FasahClient();

/**
 * GET /api/zatca-tas/customs/forigen/driver-truck-info
 * Query: purpose, consignmentNumber, … (forwarded); userType only for broker/transporter base URL.
 */
router.get('/forigen/driver-truck-info', async (req, res) => {
  try {
    const token =
      req.headers['x-fasah-token'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.',
        error: 'Missing authentication token'
      });
    }

    const { userType = 'broker', ...upstreamQuery } = req.query;

    const result = await client.getZatcaTasCustomsForeignDriverTruckInfo({
      token,
      userType,
      query: upstreamQuery
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load customs driver-truck info',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
