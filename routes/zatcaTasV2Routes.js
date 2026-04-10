const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');
const User = require('./models/User');

const client = new FasahClient();

/**
 * POST /api/zatca-tas/v2/appointment/land/create
 * Same path and JSON body shape as ZATCA TAS v2 land appointment create.
 * Optional body field userType: broker | transporter (stripped before upstream).
 */
router.post('/appointment/land/create', async (req, res) => {
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

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'JSON body is required'
      });
    }

    const payload = { ...req.body };
    const userType = payload.userType || 'broker';
    delete payload.userType;

    const result = await client.createLandAppointment({
      body: payload,
      token,
      userType
    });

    if (result?.success === false) {
      return res.status(400).json({
        success: false,
        data: result
      });
    }

    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { bookingCount: 1 } });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to create land appointment',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
