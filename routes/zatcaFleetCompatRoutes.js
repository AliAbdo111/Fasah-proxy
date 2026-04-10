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
      userType
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
      userType
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
