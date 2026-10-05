// @ts-nocheck
const express = require('express');
const router = express.Router();
const fasahMod = require('../services/fasahClient');
const FasahClient = fasahMod.default;
const { extractFasahMessage } = fasahMod;
const User = require('../schemas/user.schema').default;
const bookingDailyLimits = require('../services/bookingDailyLimits').default;
const bookingHistoryService = require('../services/bookingHistoryService');
const loggerService = require('../services/logger.service').default;
const queueAppointmentService = require('../services/queueAppointmentService');

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

// Initialize client
const client = FasahClient.getInstance();

function extractTasBookRef(result) {
  return (
    result?.data?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.result?.validated?.[0]?.tasBookRef ||
    ''
  );
}

function extractFasahTokenFromRequest(req) {
  const raw =
    req.headers['x-fasah-token'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.headers['token']?.replace(/^Bearer\s+/i, '');
  return raw ? String(raw).replace(/^Bearer\s+/i, '').trim() : '';
}

async function persistFasahTokenAndDeclarationLog(user, fasahToken, { decNo, arrivalPort, userType }, response) {
  if (!user || !user._id) return;
  const cleanToken = fasahToken ? String(fasahToken).replace(/^Bearer\s+/i, '').trim() : '';
  if (cleanToken) {
    await User.findByIdAndUpdate(user._id, {
      $set: { fasahToken: cleanToken, fasahTokenUpdatedAt: new Date() }
    });
  }
  await loggerService.createLogger({
    message: 'GET /api/fasah/appointment/transit/getDeclarationInfo',
    type: 'getDeclarationInfo_response',
    data: {
      userId: user._id,
      email: user.email,
      query: { decNo, arrivalPort, userType },
      response
    }
  });
}

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

    // if (!token) {
    //   return res.status(401).json({
    //     success: false,
    //     message: 'Authentication token is required. Provide token via x-fasah-token header or Authorization header.',
    //     error: 'Missing authentication token'
    //   });
    // }

    const result = await client.getLandSchedule({
      departure,
      arrival,
      type,
      economicOperator,
      token,
      userType: userType || 'broker',
      proxyContext: req.user
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


router.get('/drivers/verified/all/forAdd', async (req, res) => {
  try {
    // Extract query parameters
    const { port, appointmentTime, page, size, order, sortby, q, localTrucks, userType='broker' } = req.query;
    
    // Get token from header (same method as existing route)
    const token = req.headers['x-fasah-token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.',
        error: 'Missing authentication token'
      });
    }

    // Call the new client method
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
      userType: userType, // This endpoint is for transporter portal
      proxyContext: req.user
    });

    // Return the API response directly
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error fetching verified drivers:', error);
    res.status(status).json({
      success: false,
      message: 'Failed to retrieve verified drivers list',
      error: error.message,
      ...(error.data && { details: error.data })
    });
  }
});

router.get('/trucks/verified/all/forAdd', async (req, res) => {
  try {
    // استخراج معاملات البحث من query parameters
    const { port, appointmentTime, page, size, order, sortby, q, localTrucks, userType='broker' } = req.query;
    
    // الحصول على رمز المصادقة من الهيدرات
    const token = req.headers['x-fasah-token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'رمز المصادقة مطلوب',
        error: 'Missing authentication token'
      });
    }

    // استدعاء Method الحصول على الشاحنات
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
      userType: userType,
      proxyContext: req.user
    });

    // إرجاع النتيجة
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('خطأ في جلب الشاحنات:', error);
    res.status(status).json({
      success: false,
      message: 'فشل في الحصول على قائمة الشاحنات',
      error: error.message,
      ...(error.data && { details: error.data })
    });
  }
});

/**
 * GET /api/fasah/appointment/transit/getDeclarationInfo
 * Validate declaration number / get declaration info
 * Query: decNo (required), arrivalPort (required), userType (optional, default broker)
 */
router.get('/appointment/transit/getDeclarationInfo', async (req, res) => {
  const { decNo, arrivalPort, userType: userTypeQ, usertype: usertypeQ } = req.query;
  const userType = userTypeQ || usertypeQ || 'broker';
  const token = extractFasahTokenFromRequest(req);
  try {
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.',
        error: 'Missing authentication token'
      });
    }
    if (!decNo || !arrivalPort) {
      return res.status(400).json({
        success: false,
        message: 'decNo and arrivalPort are required'
      });
    }
    const result = await client.getDeclarationInfo({
      decNo,
      arrivalPort,
      token,
      userType,
      proxyContext: req.user
    });

    if (req.user && req.user._id) {
      try {
        await persistFasahTokenAndDeclarationLog(
          req.user,
          token,
          { decNo, arrivalPort, userType },
          result
        );
      } catch (persistErr) {
        console.error('getDeclarationInfo persist/log failed:', persistErr);
      }
    }

    // Handle FASAH API returning success: false with errors (e.g. invalid declaration)
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
    if (req.user && req.user._id) {
      try {
        await persistFasahTokenAndDeclarationLog(
          req.user,
          token,
          { decNo, arrivalPort, userType },
          { error: error.message || String(error), data: error.data || null }
        );
      } catch (persistErr) {
        console.error('getDeclarationInfo persist/log failed:', persistErr);
      }
    }
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to get declaration info',
      ...(error.data && { details: error.data })
    });
  }
});

router.post('/appointment/transit/create', async (req, res) => {
  // Declared outside the try so the catch block can also sync a failure.
  const targetQueueId =
    req.body?.queueAppointmentId || req.headers['x-queue-appointment-id'] || null;
  try {
    // استخراج البيانات من request body
    const {
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type = '',
      fleet_info,
      bayan_appointment = {},
      declaration_number,
      userType = 'broker',
      type = null,
      queueAppointmentId = null
    } = req.body;
    
    // الحصول على رمز المصادقة من الهيدرات
    const token = req.headers['x-fasah-token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['token']?.replace(/^Bearer\s+/i, '');
    const gRecaptchaResponse = req.headers['g-recaptcha-response'];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'رمز المصادقة مطلوب',
        error: 'Missing authentication token'
      });
    }

    // التحقق من البيانات المطلوبة
    if (!port_code || !zone_schedule_id || !purpose || !declaration_number || !fleet_info) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير مكتملة',
        error: 'يجب تقديم جميع البيانات المطلوبة: port_code, zone_schedule_id, purpose, declaration_number, fleet_info'
      });
    }

    let bookingDecision = null;
    if (req.user && req.user._id) {
      try {
        const gate = await bookingDailyLimits.assertCanTransitBook(req.user._id);
        bookingDecision = gate && gate.decision ? gate.decision : null;
      } catch (e) {
        const status = e.status || 403;
        return res.status(status).json({ success: false, message: e.message });
      }
    }

    // استدعاء Method إنشاء الموعد
    const result = await client.createTransitAppointment({
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type,
      fleet_info,
      bayan_appointment,
      declaration_number,
      token,
      userType: userType,
      proxyContext: req.user,
      proxyUrl: req.headers.proxy,
      gRecaptchaResponse
    });

    // Count as success only when tasBookRef exists
    const tasBookRef = extractTasBookRef(result);
    const hasSuccessfulBooking = Boolean(tasBookRef);
    if (!hasSuccessfulBooking) {
      const upstreamMessage =
        result?.message ||
        extractFasahMessage(result) ||
        result?.data?.message ||
        result?.data?.data?.message ||
        'Booking not created';

      // FASAH rejected the booking, so the queue appointment is failed.
      await syncQueueAppointmentFailed({
        targetQueueId,
        req,
        message: upstreamMessage
      });

      await bookingHistoryService.logBooking({
        userId: req.user && req.user._id,
        endpoint: '/api/fasah/appointment/transit/create',
        kind: bookingDailyLimits.normalizeTransitBookingKind(type),
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
  /*    await bookingDailyLimits.recordTransitBookingSuccess(
        req.user._id,
        bookingDecision,
        type
      );
    */
      }

    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/fasah/appointment/transit/create',
      kind: bookingDailyLimits.normalizeTransitBookingKind(type),
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
      tasBookRef
    });

    // إرجاع النتيجة الناجحة
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('خطأ في إنشاء موعد النقل العابر:', error);

    // The upstream call failed or threw; mark the queue appointment as failed.
    await syncQueueAppointmentFailed({
      targetQueueId,
      req,
      message: error?.message || 'Booking error'
    });

    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/fasah/appointment/transit/create',
      kind: bookingDailyLimits.normalizeTransitBookingKind(req.body && req.body.type),
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
      error: error?.message,
      ...(error.data && { details: error?.data })
    });
  }
});

router.post('/appointment/non-declaration/create', async (req, res) => {
  try {
    // استخراج البيانات من request body
    const {
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type = '',
      fleet_info,
      bayan_appointment = {},
      userType = 'broker'
    } = req.body;
    
    // الحصول على رمز المصادقة من الهيدرات
    const token = req.headers['x-fasah-token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'رمز المصادقة مطلوب',
        error: 'Missing authentication token'
      });
    }

    // التحقق من البيانات المطلوبة
    if (!port_code || !zone_schedule_id || !purpose  || !fleet_info) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير مكتملة',
        error: 'يجب تقديم جميع البيانات المطلوبة: port_code, zone_schedule_id, purpose, fleet_info'
      });
    }

    let bookingDecision = null;
    if (req.user && req.user._id) {
      try {
        const gate = await bookingDailyLimits.assertCanTransitBook(req.user._id);
        bookingDecision = gate && gate.decision ? gate.decision : null;
      } catch (e) {
        const status = e.status || 403;
        return res.status(status).json({ success: false, message: e.message });
      }
    }

    // استدعاء Method إنشاء الموعد
    const result = await client.createNonDeclarationAppointment({
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type,
      fleet_info,
      bayan_appointment,
      token,
      userType: userType,
      proxyContext: req.user
    });

    // Count as success only when tasBookRef exists
    const tasBookRef = extractTasBookRef(result);
    const hasSuccessfulBooking = Boolean(tasBookRef);
    if (!hasSuccessfulBooking) {
      const upstreamMessage =
        result?.message ||
        extractFasahMessage(result) ||
        result?.data?.message ||
        result?.data?.data?.message ||
        'Booking not created';
      await bookingHistoryService.logBooking({
        userId: req.user && req.user._id,
        endpoint: '/api/fasah/appointment/transit/create',
        kind: 'transit',
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
      await bookingDailyLimits.recordTransitBookingSuccess(req.user._id, bookingDecision);
    }

    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/fasah/appointment/transit/create',
      kind: 'transit',
      success: true,
      httpStatus: 200,
      message: 'Booking created',
      requestBody: req.body || {},
      requestQuery: req.query || {},
      responseBody: result,
      consumptionType: bookingDecision && bookingDecision.consumptionType,
      extraPriceApplied: bookingDecision && bookingDecision.extraPriceApplied
    });

    // إرجاع النتيجة الناجحة
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('خطأ في إنشاء موعد النقل العابر:', error);
    await bookingHistoryService.logBooking({
      userId: req.user && req.user._id,
      endpoint: '/api/fasah/appointment/transit/create',
      kind: 'transit',
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
      error: error?.message,
      ...(error.data && { details: error?.data })
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

export default router;
