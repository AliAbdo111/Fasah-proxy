const mongoose = require('mongoose');

const bookingHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: false
    },
    endpoint: {
      type: String,
      required: true,
      index: true
    },
    kind: {
      type: String,
      enum: ['transit', 'import', 'other'],
      default: 'other',
      index: true
    },
    success: {
      type: Boolean,
      required: true,
      index: true
    },
    httpStatus: {
      type: Number,
      default: 200
    },
    message: {
      type: String,
      default: ''
    },
    requestBody: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    requestQuery: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

bookingHistorySchema.index({ userId: 1, createdAt: -1 });
bookingHistorySchema.index({ endpoint: 1, createdAt: -1 });

module.exports = mongoose.model('BookingHistory', bookingHistorySchema);
