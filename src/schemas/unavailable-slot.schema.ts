// @ts-nocheck
/* Ported from routes/models/UnavailableSlot.js */
import mongoose from 'mongoose';

const unavailableSlotSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    zone_schedule_id: { type: String, required: true, index: true },
    port_code: { type: String, default: '' },
    reason: { type: String, default: 'zero_available_slots' },
    markedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'unavailable_slots' }
);

unavailableSlotSchema.index({ sessionId: 1, zone_schedule_id: 1 }, { unique: true });
unavailableSlotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('UnavailableSlot', unavailableSlotSchema);
