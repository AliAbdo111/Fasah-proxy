// @ts-nocheck
/* Ported from services/transitBookingCore.js */
import FasahClient from './fasahClient';
import { extractFasahMessage } from './fasahClient';
import bookingDailyLimits from './bookingDailyLimits';
import * as bookingHistoryService from './bookingHistoryService';

const client = FasahClient.getInstance ? FasahClient.getInstance() : new FasahClient();

function extractTasBookRef(result) {
  return (
    result?.data?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.data?.result?.validated?.[0]?.tasBookRef ||
    result?.result?.validated?.[0]?.tasBookRef ||
    ''
  );
}

function isZeroAvailableSlotsMessage(message, result) {
  const parts = [
    message,
    extractFasahMessage(result),
    result?.data?.data?.result?.errors?.[0]?.code,
    result?.data?.data?.result?.errors?.[0]?.message,
    result?.errors?.[0]?.code,
    result?.errors?.[0]?.message
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  return parts.some((s) => s.includes('zero_available_slots') || s.includes('zero available'));
}

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
    return { success: false, httpStatus: 401, message: 'رمز المصادقة مطلوب', zeroAvailableSlots: false };
  }

  if (!port_code || !zone_schedule_id || !purpose || !declaration_number || !fleet_info) {
    return {
      success: false,
      httpStatus: 400,
      message: 'بيانات غير مكتملة',
      zeroAvailableSlots: false
    };
  }

  let bookingDecision = null;
  if (mongoUserId) {
    try {
      const gate = await bookingDailyLimits.assertCanTransitBook(mongoUserId);
      bookingDecision = gate?.decision || null;
    } catch (e) {
      return {
        success: false,
        httpStatus: e.status || 403,
        message: e.message,
        zeroAvailableSlots: false
      };
    }
  }
  console.log('createTransitAppointment', {
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
  const upstreamMessage =
    result?.message ||
    result?.data?.message ||
    result?.data?.data?.message ||
    extractFasahMessage(result) ||
    'Booking not created';
  const zeroAvailableSlots = isZeroAvailableSlotsMessage(upstreamMessage, result);

  const logBase = {
    userId: mongoUserId,
    endpoint: endpoint || '/watcher/auto-book',
    kind: 'transit',
    requestBody: body,
    requestQuery: {},
    responseBody: result,
    consumptionType: bookingDecision?.consumptionType,
    extraPriceApplied: bookingDecision?.extraPriceApplied
  };

  if (!tasBookRef) {
    await bookingHistoryService.logBooking({
      ...logBase,
      success: false,
      httpStatus: 400,
      message: upstreamMessage
    });
    console.log('[booking] failed', { ...logCtx, message: upstreamMessage, zeroAvailableSlots });
    return {
      success: false,
      httpStatus: 400,
      message: upstreamMessage,
      zeroAvailableSlots,
      data: result
    };
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
    zeroAvailableSlots: false,
    data: result
  };
}

export { client };
export { extractTasBookRef };
export { isZeroAvailableSlotsMessage };
export { executeTransitBooking };
