const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

const client = new FasahClient();

/**
 * GET /api/zatca-fleet/v1/lookup/resident/countries
 * Proxies to ZATCA fleet v1 resident-country lookup; forwards query params except userType.
 */
router.get('/lookup/resident/countries', async (req, res) => {
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

    const result = await client.getFleetResidentCountriesLookup({
      token,
      userType,
      query: upstreamQuery
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load resident countries lookup',
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/zatca-fleet/v1/nationality
 */
router.get('/nationality', async (req, res) => {
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

    const result = await client.getFleetNationalityLookup({
      token,
      userType,
      query: upstreamQuery
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load nationality lookup',
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/zatca-fleet/v1/lookup/truck/colors?q=
 */
router.get('/lookup/truck/colors', async (req, res) => {
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

    const result = await client.getFleetTruckColorsLookup({
      token,
      userType,
      query: upstreamQuery
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load truck colors lookup',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
