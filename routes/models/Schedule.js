const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
scheduleData: { type: Object, required: true },
createdAt: { type: Date, default: Date.now },
updatedAt: { type: Date, default: Date.now },
});

const Schedule = mongoose.model('Schedule', scheduleSchema);

module.exports = Schedule;