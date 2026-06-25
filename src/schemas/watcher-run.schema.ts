// @ts-nocheck
/* Ported from routes/models/WatcherRun.js */
import mongoose from 'mongoose';

const watcherRunSchema = new mongoose.Schema(
  {
    phase: {
      type: String,
      enum: ['idle', 'polling', 'booking', 'done', 'error'],
      default: 'idle',
      index: true
    },
    sessionId: { type: String, index: true },
    startedAt: Date,
    stoppedAt: Date,
    slotsFound: { type: Boolean, default: false },
    usersChecked: { type: Number, default: 0 },
    appointmentsBooked: { type: Number, default: 0 },
    appointmentsFailed: { type: Number, default: 0 },
    pollTicks: { type: Number, default: 0 },
    lastError: String,
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true, collection: 'watcher_runs' }
);

watcherRunSchema.index({ updatedAt: -1 });

export default mongoose.model('WatcherRun', watcherRunSchema);
