const cron = require('node-cron');
const bookingDailyLimits = require('./bookingDailyLimits');

let job = null;

/**
 * Every day at 00:00 — reset transitBookingCount + importBookingCount for all users.
 * Midnight uses BOOKING_DAY_TIMEZONE, BOOKING_DAILY_RESET_TZ, or default Africa/Cairo (same as bookingDailyLimits).
 * Disable: BOOKING_DAILY_RESET_ENABLED=false
 */
function start() {
  if (job) return;

  if (process.env.BOOKING_DAILY_RESET_ENABLED === 'false') {
    console.log('Daily booking reset cron: disabled (BOOKING_DAILY_RESET_ENABLED=false)');
    return;
  }

  const timezone =
    process.env.BOOKING_DAY_TIMEZONE || process.env.BOOKING_DAILY_RESET_TZ || 'Africa/Cairo';

  job = cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const r = await bookingDailyLimits.resetAllUsersDailyBookingCounters();
        console.log(
          `[${new Date().toISOString()}] Daily booking counters reset (${timezone} midnight):`,
          r
        );
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Daily booking counters reset failed:`,
          err.message
        );
      }
    },
    { scheduled: true, timezone }
  );

  console.log(`Daily booking reset cron: 00:00 every day (${timezone})`);
}

function stop() {
  if (job) {
    job.stop();
    job = null;
    console.log('Daily booking reset cron: stopped');
  }
}

module.exports = { start, stop };
