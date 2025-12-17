const mongoose = require('mongoose');

const loggerSchema = new mongoose.Schema({
  message: { type: String, required: false },
  data: { type: Object, required: false },
  type: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },

});

const logger = mongoose.model('logger', loggerSchema);

module.exports = logger;