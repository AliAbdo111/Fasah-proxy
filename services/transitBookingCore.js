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

function summarizeUpstreamResult(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    message: result.message ?? result.data?.message ?? result.data?.data?.message,
    tasBookRef: extractTasBookRef(result),
    validated:
      result?.data?.data?.result?.validated ??
      result?.data?.result?.validated ??
      result?.result?.validated,
    errors:
      result?.data?.data?.result?.errors ??
      result?.data?.result?.errors ??
      result?.errors,
    success: result.success
  };
}

function logBookingResult({ mongoUserId, appointmentId, endpoint, proxyIndex, body, outcome }) {
  const request = body
    ? {
        port_code: body.port_code,
        zone_schedule_id: body.zone_schedule_id,
        purpose: body.purpose,
        declaration_number: body.declaration_number,
        userType: body.userType,
        fleet_count: Array.isArray(body.fleet_info) ? body.fleet_info.length : 0
      }
    : {};

  console.log('[booking] result', {
    at: new Date().toISOString(),
    userId: mongoUserId || null,
    appointmentId: appointmentId || null,
    endpoint: endpoint || '/api/fasah/appointment/transit/create',
    proxyIndex: proxyIndex ?? null,
    request,
    ...outcome
  });
}

/**
 * Create one transit appointment (same rules as POST /api/fasah/appointment/transit/create).
 * @param {object} opts
 * @param {string} opts.mongoUserId — app user for limits/history
 * @param {object} opts.body — IApiCreateTransitAppointment fields
 * @param {number} [opts.proxyIndex] — fixed platform proxy slot for parallel waves
 * @param {object} [opts.proxyContext] — req.user for future per-user pools
 */
async function executeTransitBooking({
  mongoUserId,
  body,
  proxyIndex,
  proxyContext,
  endpoint,
  appointmentId
}) {
  const logCtx = { mongoUserId, appointmentId, endpoint, proxyIndex, body };
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
    const out = { success: false, httpStatus: 401, message: 'رمز المصادقة مطلوب', error: 'Missing token' };
    logBookingResult({
      ...logCtx,
      outcome: { success: false, httpStatus: 401, message: out.message, error: out.error }
    });
    return out;
  }

  if (!port_code || !zone_schedule_id || !purpose || !declaration_number || !fleet_info) {
    const out = {
      success: false,
      httpStatus: 400,
      message: 'بيانات غير مكتملة',
      error: 'Missing port_code, zone_schedule_id, purpose, declaration_number, or fleet_info'
    };
    logBookingResult({
      ...logCtx,
      outcome: { success: false, httpStatus: 400, message: out.message, error: out.error }
    });
    return out;
  }

  let bookingDecision = null;
  if (mongoUserId) {
    try {
      const gate = await bookingDailyLimits.assertCanTransitBook(mongoUserId);
      bookingDecision = gate?.decision || null;
    } catch (e) {
      console.log('[transitBookingCore] executeTransitBooking error', e);
      const out = { success: false, httpStatus: e.status || 403, message: e.message };
      logBookingResult({
        ...logCtx,
        outcome: { success: false, httpStatus: out.httpStatus, message: out.message }
      });
      return out;
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
    const out = { success: false, httpStatus: 400, message: upstreamMessage, data: result };
    logBookingResult({
      ...logCtx,
      outcome: {
        success: false,
        httpStatus: 400,
        message: upstreamMessage,
        tasBookRef: '',
        upstream: summarizeUpstreamResult(result)
      }
    });
    return out;
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

  const out = {
    success: true,
    httpStatus: 200,
    message: 'Booking created',
    tasBookRef,
    data: result
  };
  logBookingResult({
    ...logCtx,
    outcome: {
      success: true,
      httpStatus: 200,
      message: out.message,
      tasBookRef,
      upstream: summarizeUpstreamResult(result)
    }
  });
  return out;
}

module.exports = {
  client,
  extractTasBookRef,
  executeTransitBooking
};
