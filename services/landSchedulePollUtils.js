const { extractLandSchedules } = require('./landScheduleExtract');

/**
 * True when FASAH land schedule response has at least one usable slot.
 * Note: errors[].code "200" with message "لا يوجد مواعيد متاحة" means NO slots — not a stop signal.
 */
function hasUsableLandSchedules(data) {
  if (!data || data.success === false) {
    return false;
  }
  return extractLandSchedules(data).schedules.length > 0;
}

module.exports = { hasUsableLandSchedules };
