const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');
const bookingDailyLimits = require('../services/bookingDailyLimits');
const bookingHistoryService = require('../services/bookingHistoryService');

const client = new FasahClient();

/**
 * GET /api/zatca-tas/v2/appointment/bulk/getDeclarationInfo
 * Query: decNo, port (required), purpose, toRefNo, … (forwarded); userType only for broker/transporter base URL.
 */
router.get('/appointment/bulk/getDeclarationInfo', async (req, res) => {
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

    const { userType: userTypeQ, usertype: usertypeQ, ...upstreamQuery } = req.query;
    const userType = userTypeQ || usertypeQ || 'broker';

    const result = await client.getBulkDeclarationInfo({
      token,
      userType,
      query: upstreamQuery
    });

    if (result && result.success === false && result.errors && result.errors.length > 0) {
      const firstError = result.errors[0];
      const message = firstError.message || firstError.code || 'Declaration validation failed';
      return res.status(400).json({
        success: false,
        message,
        errors: result.errors
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to get bulk declaration info',
      ...(error.data && { details: error.data })
    });
  }
});

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

    let bookingDecision = null;
    if (req.user && req.user._id) {
      try {
        const gate = await bookingDailyLimits.assertCanImportBook(req.user._id);
        bookingDecision = gate && gate.decision ? gate.decision : null;
      } catch (e) {
        const status = e.status || 403;
        return res.status(status).json({ success: false, message: e.message });
      }
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
      await bookingHistoryService.logBooking({
        userId: req.user && req.user._id,
        endpoint: '/api/zatca-tas/v2/appointment/land/create',
        kind: 'import',
        success: false,
        httpStatus: 400,
        message: 'Booking not created',
        requestBody: req.body || {},
        requestQuery: req.query || {},
        responseBody: result,
        consumptionType: bookingDecision && bookingDecision.consumptionType,
        extraPriceApplied: bookingDecision && bookingDecision.extraPriceApplied
      });
      return res.status(400).json({
        success: false,
        data: result
      });
    }

    if (req.user && req.user._id) {
      await bookingDailyLimits.recordImportBookingSuccess(req.user._id, bookingDecision);
    }

    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/zatca-tas/v2/appointment/land/create',
      kind: 'import',
      success: true,
      httpStatus: 200,
      message: 'Booking created',
      requestBody: req.body || {},
      requestQuery: req.query || {},
      responseBody: result,
      consumptionType: bookingDecision && bookingDecision.consumptionType,
      extraPriceApplied: bookingDecision && bookingDecision.extraPriceApplied
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;
    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/zatca-tas/v2/appointment/land/create',
      kind: 'import',
      success: false,
      httpStatus: status,
      message: error?.message || 'Booking error',
      requestBody: req.body || {},
      requestQuery: req.query || {},
      responseBody: error?.data || {},
      consumptionType: '',
      extraPriceApplied: 0
    });
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to create land appointment',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
