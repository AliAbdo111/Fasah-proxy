const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    departure: { type: String, index: true },
    arrival: { type: String, index: true },
    type: { type: String, index: true },
    finalDest: { type: String },
    economicOperator: { type: String },
    userType: { type: String },
    scheduleData: { type: Object, required: true },
  },
  { timestamps: true }
);

const Schedule = mongoose.model('Schedule', scheduleSchema);

module.exports = Schedule;
