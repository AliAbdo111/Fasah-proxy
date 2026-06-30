// @ts-nocheck
/* Ported from routes/models/QueueAppointment.js */
import mongoose from 'mongoose';

const selectedSlotSchema = new mongoose.Schema(
  {
    banHour: Boolean,
    zone_schedule_id: String,
    zone_code: String,
    port_code: String,
    schedule_from: String,
    schedule_to: String,
    slot_status: String,
    scheduled_slot: Number,
    available_slot: Number,
    is_active: String,
    count_book: Number,
    can_book: Boolean,
    schedule_type: String,
    schedule_direction: String,
    land_price_msg: String
  },
  { _id: false }
);

const appointmentBlockSchema = new mongoose.Schema(
  {
    selectedDate: { type: Date },
    selectedSlot: selectedSlotSchema
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    plateType: String,
    vehicleSequenceNumber: String,
    plateNumberAr: String,
    plateNumberEn: String,
    plateCountry: String,
    chassisNo: String,
    truckCategoryGroup: String,
    categoryGroupCode: String,
    truckColor: String,
    truckColorCode: String
  },
  { _id: false }
);

const driverSchema = new mongoose.Schema(
  {
    licenseNo: String,
    nameAr: String,
    nameEn: String,
    residentCountry: String
  },
  { _id: false }
);

const tokenSchema = new mongoose.Schema(
  {
    token: String,
    declarationNumber: String,
    type: String,
    vehicleType: String
  },
  { _id: false }
);

const fleetInfoSchema = new mongoose.Schema(
  {
    licenseNo: String,
    residentCountry: String,
    chassisNo: String,
    plateCountry: String,
    vehicleSequenceNumber: String
  },
  { _id: false }
);

const submitDataSchema = new mongoose.Schema(
  {
    userType: String,
    token: String,
    cargo_type: String,
    declaration_number: String,
    port_code: String,
    purpose: String,
    bayan_appointment: mongoose.Schema.Types.Mixed,
    zone_schedule_id: String,
    fleet_info: [fleetInfoSchema]
  },
  { _id: false }
);

const queueAppointmentSchema = new mongoose.Schema(
  {
    /** Business id from frontend (e.g. 1781527633316) */
    id: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['in_queue', 'pending', 'booked', 'failed', 'cancelled', 'success'],
      default: 'in_queue',
      index: true
    },
    appointment: appointmentBlockSchema,
    vehicle: vehicleSchema,
    driver: driverSchema,
    token: tokenSchema,
    submitData: submitDataSchema,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    /** Preferred FASAH slot id — synced from submitData / selectedSlot on create */
    zone_schedule_id: { type: String, index: true },
    bookingAttempts: { type: Number, default: 0, min: 0 },
    lastError: String,

    error: String,
    tasBookRef: String,
    bookedAt: Date
  },
  { timestamps: true, collection: 'queue_appointments' }
);

queueAppointmentSchema.index({ userId: 1, id: 1 }, { unique: true });
queueAppointmentSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export default mongoose.model('QueueAppointment', queueAppointmentSchema);
