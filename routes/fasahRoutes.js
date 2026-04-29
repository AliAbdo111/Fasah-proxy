const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');
const User = require('./models/User');
const bookingDailyLimits = require('../services/bookingDailyLimits');
const bookingHistoryService = require('../services/bookingHistoryService');

// Initialize client
const client = new FasahClient();

function extractTasBookRef(result) {
  return (
    result?.data?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.result?.validated?.[0]?.tasBookRef ||
    ''
  );
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
  try {
    const { decNo, arrivalPort, userType: userTypeQ, usertype: usertypeQ } = req.query;
    const userType = userTypeQ || usertypeQ || 'broker';
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
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to get declaration info',
      ...(error.data && { details: error.data })
    });
  }
});

router.post('/appointment/transit/create', async (req, res) => {
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
      proxyContext: req.user
    });

    // Count as success only when tasBookRef exists
    const tasBookRef = extractTasBookRef(result);
    const hasSuccessfulBooking = Boolean(tasBookRef);
    if (!hasSuccessfulBooking) {
      const upstreamMessage =
        result?.message ||
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

module.exports = router;

