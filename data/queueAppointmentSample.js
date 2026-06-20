const SAMPLE_FASAH_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.REPLACE_ME';

function buildSampleQueueAppointment(overrides = {}) {
  const token = overrides.token?.token || overrides.submitData?.token || SAMPLE_FASAH_TOKEN;

  const base = {
    id: String(Date.now()),
    status: 'in_queue',
    appointment: {
      selectedDate: '2026-06-16T12:47:06.003Z',
      selectedSlot: {
        banHour: false,
        zone_schedule_id: '18',
        zone_code: '31',
        port_code: '31',
        schedule_from: '2026-06-16 18:00:00',
        schedule_to: '2026-06-16 18:59:00',
        slot_status: 'Available',
        scheduled_slot: 30,
        available_slot: 30,
        is_active: 'Y',
        count_book: 0,
        can_book: true,
        schedule_type: '7',
        schedule_direction: '1',
        land_price_msg: 'معفى من الأجور خلال الفترة التجريبية'
      }
    },
    vehicle: {
      plateType: '2',
      vehicleSequenceNumber: '1000000000',
      plateNumberAr: '10423',
      plateNumberEn: '10423',
      plateCountry: '120',
      chassisNo: '64GFD6G4DF56G4D56',
      truckCategoryGroup: 'شاحنة',
      categoryGroupCode: '5',
      truckColor: 'أبيض',
      truckColorCode: '2'
    },
    driver: {
      licenseNo: '03165165132',
      nameAr: 'محمد عيد موسي ',
      nameEn: 'mohmed aed mouse',
      residentCountry: '120'
    },
    token: {
      token,
      declarationNumber: '559521',
      type: 'transporter',
      vehicleType: 'local'
    },
    submitData: {
      userType: 'transporter',
      token,
      cargo_type: '',
      declaration_number: '559521',
      port_code: '31',
      purpose: '6',
      bayan_appointment: {},
      zone_schedule_id: '18',
      fleet_info: [
        {
          licenseNo: '051854123185412',
          residentCountry: '120',
          chassisNo: '22222222222222222',
          plateCountry: '120',
          vehicleSequenceNumber: '10268'
        }
      ]
    }
  };

  return deepMerge(base, overrides);
}

const SAMPLE_QUEUE_APPOINTMENT = buildSampleQueueAppointment({
  id: '1781527633316'
});

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof out[key] === 'object' && out[key]) {
      out[key] = deepMerge(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

module.exports = {
  SAMPLE_FASAH_TOKEN,
  SAMPLE_QUEUE_APPOINTMENT,
  buildSampleQueueAppointment
};
