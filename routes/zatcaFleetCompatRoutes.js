const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

const client = new FasahClient();

/**
 * GET /api/zatca-fleet/v2/driver/verified/all/forAdd
 */
router.get('/driver/verified/all/forAdd', async (req, res) => {
  try {
    const {
      port,
      appointmentTime,
      page,
      size,
      order,
      sortby,
      q,
      localTrucks,
      userType = 'broker'
    } = req.query;

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

    const result = await client.getVerifiedDrivers({
      port,
      appointmentTime,
      token,
      page: page || 1,
      size: size || 10,
      order: order || 'desc',
      sortby: sortby || 'licenseNo',
      q: q || '',
      localTrucks,
      userType,
      proxyContext: req.user
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to retrieve verified drivers list',
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/zatca-fleet/v2/truck/lookup/brands?q=
 */
router.get('/truck/lookup/brands', async (req, res) => {
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

    const result = await client.getFleetV2TruckBrandsLookup({
      token,
      userType,
      query: upstreamQuery,
      proxyContext: req.user
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load truck brands lookup',
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/zatca-fleet/v2/truck/lookup/models/:brandCode?q=
 */
router.get('/truck/lookup/models/:brandCode', async (req, res) => {
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
    const { brandCode } = req.params;

    const result = await client.getFleetV2TruckModelsLookup({
      brandCode,
      token,
      userType,
      query: upstreamQuery,
      proxyContext: req.user
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to load truck models lookup',
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/zatca-fleet/v2/truck/verified/all/forAdd
 * Same path and params as ZATCA fleet API (incl. localTrucks)
 */
router.get('/truck/verified/all/forAdd', async (req, res) => {
  try {
    const {
      port,
      appointmentTime,
      page,
      size,
      order,
      sortby,
      q,
      localTrucks,
      userType = 'broker'
    } = req.query;

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

    const result = await client.getVerifiedTrucks({
      port,
      appointmentTime,
      token,
      page: page || 1,
      size: size || 10,
      order: order || 'desc',
      sortby: sortby || 'plateNumberEn',
      q: q || '',
      localTrucks,
      userType,
      proxyContext: req.user
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to retrieve verified trucks list',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
