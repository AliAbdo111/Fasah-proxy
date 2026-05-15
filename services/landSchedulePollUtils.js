/**
 * True when FASAH land schedule response has at least one usable slot.
 * Note: errors[].code "200" with message "لا يوجد مواعيد متاحة" means NO slots — not a stop signal.
 */
function hasUsableLandSchedules(data) {
  if (!data || data.success === false) {
    return false;
  }
  const candidates = [
    data.schedules,
    data.data?.schedules,
    data.result?.schedules,
    data.data?.data?.schedules,
    data.data?.result?.schedules
  ];
  return candidates.some((list) => Array.isArray(list) && list.length > 0);
}

module.exports = { hasUsableLandSchedules };
