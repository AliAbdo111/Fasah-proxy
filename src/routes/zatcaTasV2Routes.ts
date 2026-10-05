// @ts-nocheck
const express = require('express');
const router = express.Router();
const fasahMod = require('../services/fasahClient');
const FasahClient = fasahMod.default;
const { extractFasahMessage } = fasahMod;
const bookingDailyLimits = require('../services/bookingDailyLimits').default;
const bookingHistoryService = require('../services/bookingHistoryService');
const queueAppointmentService = require('../services/queueAppointmentService');

const client = FasahClient.getInstance();

/**
 * Mark the originating queue appointment as booked once FASAH confirms creation.
 * Never throws into the request flow: a successful FASAH booking must still succeed
 * even if the queue row cannot be updated.
 */
async function syncQueueAppointmentBooked({ targetQueueId, req, tasBookRef }) {
  if (!targetQueueId || !req.user || !req.user._id) return false;

  try {
    await queueAppointmentService.updateQueueAppointmentStatus({
      userId: req.user._id,
      queueId: targetQueueId,
      isAdmin: false,
      status: 'booked',
      tasBookRef
    });
    return true;
  } catch (e) {
    console.error('Queue appointment status sync failed:', e?.message || e);
    return false;
  }
}

/**
 * Mark the originating queue appointment as failed after FASAH rejects the
 * booking or the upstream call errors. Only invoked once a request has actually
 * been sent upstream, so client-side rejections (401/400/403) leave the row alone.
 * Same never-throw contract as the booked sync.
 */
async function syncQueueAppointmentFailed({ targetQueueId, req, message }) {
  if (!targetQueueId || !req.user || !req.user._id) return false;

  try {
    await queueAppointmentService.updateQueueAppointmentStatus({
      userId: req.user._id,
      queueId: targetQueueId,
      isAdmin: false,
      status: 'failed',
      lastError: message
    });
    return true;
  } catch (e) {
    console.error('Queue appointment failure sync failed:', e?.message || e);
    return false;
  }
}

/**
 * Read the client-supplied reCAPTCHA token, if any. Forwarded verbatim when
 * present; omitted entirely otherwise (never generated server-side).
 */
function extractRecaptchaHeader(req) {
  const raw = req.headers['g-recaptcha-response'];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/** Pull the booking reference out of a FASAH create response, if present. */
function extractTasBookRef(result) {
  return (
    result?.data?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.result?.validated?.[0]?.tasBookRef ||
    ''
  );
}

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
      query: upstreamQuery,
      proxyContext: req.user
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
  // Declared outside the try so the catch block can also sync a failure.
  const targetQueueId =
    req.body?.queueAppointmentId || req.headers['x-queue-appointment-id'] || null;
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

    // Queue linkage is metadata for the proxy only; never forwarded upstream.
    if (payload.queueAppointmentId) {
      delete payload.queueAppointmentId;
    }

    const result = await client.createLandAppointment({
      body: payload,
      token,
      userType,
      proxyContext: req.user,
      proxyUrl: req.headers.proxy,
      gRecaptchaResponse: extractRecaptchaHeader(req)
    });

    if (result?.success === false) {
      const upstreamMessage = result?.message || extractFasahMessage(result) || 'Booking not created';

      // FASAH rejected the booking, so the queue appointment is failed.
      await syncQueueAppointmentFailed({
        targetQueueId,
        req,
        message: upstreamMessage
      });

      await bookingHistoryService.logBooking({
        userId: req.user && req.user._id,
        endpoint: '/api/zatca-tas/v2/appointment/land/create',
        kind: 'import',
        success: false,
        httpStatus: 400,
        message: upstreamMessage,
        requestBody: req.body || {},
        requestQuery: req.query || {},
        responseBody: result,
        consumptionType: bookingDecision && bookingDecision.consumptionType,
        extraPriceApplied: bookingDecision && bookingDecision.extraPriceApplied
      });
      return res.status(400).json({
        success: false,
        message: upstreamMessage,
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

    // FASAH confirmed the booking, so the originating queue appointment is now booked.
    await syncQueueAppointmentBooked({
      targetQueueId,
      req,
      tasBookRef: extractTasBookRef(result)
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.status || 500;

    // The upstream call failed or threw; mark the queue appointment as failed.
    await syncQueueAppointmentFailed({
      targetQueueId,
      req,
      message: error?.message || 'Booking error'
    });

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

export default router;
