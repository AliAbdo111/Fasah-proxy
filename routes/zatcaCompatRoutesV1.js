const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

const client = new FasahClient();

/**
 * GET /api/zatca-tas/v1/appoint/pdf/generateLand
 * Generate land appointment PDF - same path and params as ZATCA v1
 *
 * Query: ref (required) - appointment reference e.g. TAS20260316234829745
 * Query: userType (optional) - broker | transporter
 * Headers: x-fasah-token or token or Authorization (FASAH token)
 */
router.get('/appoint/pdf/generateLand', async (req, res) => {
  try {
    const { ref, userType = 'broker' } = req.query;

    const token =
      req.headers['x-fasah-token'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
        error: 'Missing authentication token'
      });
    }

    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter ref is required'
      });
    }

    const result = await client.getLandAppointmentPdf({
      ref,
      token,
      userType
    });

    if (result.data) {
      const pdfBuffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'attachment; filename="land-appointment.pdf"');
      res.set('Cache-Control', 'no-store');
      return res.send(pdfBuffer);
    }

    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate PDF',
      ...(error.data && { details: error.data })
    });
  }
});

module.exports = router;
