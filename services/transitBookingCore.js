const FasahClient = require('./fasahClient');
const bookingDailyLimits = require('./bookingDailyLimits');
const bookingHistoryService = require('./bookingHistoryService');

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
 * Create one transit appointment (same rules as POST /api/fasah/appointment/transit/create).
 * @param {object} opts
 * @param {string} opts.mongoUserId — app user for limits/history
 * @param {object} opts.body — IApiCreateTransitAppointment fields
 * @param {number} [opts.proxyIndex] — fixed platform proxy slot for parallel waves
 * @param {object} [opts.proxyContext] — req.user for future per-user pools
 */
async function executeTransitBooking({ mongoUserId, body, proxyIndex, proxyContext, endpoint }) {
  const {
    port_code,
    zone_schedule_id,
    purpose,
    cargo_type = '',
    fleet_info,
    bayan_appointment = {},
    declaration_number,
    token,
    userType = 'broker'
  } = body || {};

  if (!token) {
    return { success: false, httpStatus: 401, message: 'رمز المصادقة مطلوب', error: 'Missing token' };
  }

  if (!port_code || !zone_schedule_id || !purpose || !declaration_number || !fleet_info) {
    return {
      success: false,
      httpStatus: 400,
      message: 'بيانات غير مكتملة',
      error: 'Missing port_code, zone_schedule_id, purpose, declaration_number, or fleet_info'
    };
  }

  let bookingDecision = null;
  if (mongoUserId) {
    try {
      const gate = await bookingDailyLimits.assertCanTransitBook(mongoUserId);
      bookingDecision = gate?.decision || null;
    } catch (e) {
      return { success: false, httpStatus: e.status || 403, message: e.message };
    }
  }

  const result = await client.createTransitAppointment({
    port_code,
    zone_schedule_id,
    purpose,
    cargo_type,
    fleet_info,
    bayan_appointment,
    declaration_number,
    token,
    userType,
    proxyContext,
    proxyIndex
  });

  const tasBookRef = extractTasBookRef(result);
  const logBase = {
    userId: mongoUserId,
    endpoint: endpoint || '/api/fasah/appointment/transit/create',
    kind: 'transit',
    requestBody: body,
    requestQuery: {},
    responseBody: result,
    consumptionType: bookingDecision?.consumptionType,
    extraPriceApplied: bookingDecision?.extraPriceApplied
  };

  if (!tasBookRef) {
    const upstreamMessage =
      result?.message ||
      result?.data?.message ||
      result?.data?.data?.message ||
      'Booking not created';
    await bookingHistoryService.logBooking({
      ...logBase,
      success: false,
      httpStatus: 400,
      message: upstreamMessage
    });
    return { success: false, httpStatus: 400, message: upstreamMessage, data: result };
  }

  if (mongoUserId) {
    await bookingDailyLimits.recordTransitBookingSuccess(mongoUserId, bookingDecision);
  }

  await bookingHistoryService.logBooking({
    ...logBase,
    success: true,
    httpStatus: 200,
    message: 'Booking created'
  });

  return {
    success: true,
    httpStatus: 200,
    message: 'Booking created',
    tasBookRef,
    data: result
  };
}

module.exports = {
  client,
  extractTasBookRef,
  executeTransitBooking
};
