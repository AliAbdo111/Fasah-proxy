const logger = require('../routes/models/logger');

class LoggerService {
  async createLogger(data) {
    const newLogger = new logger(data);
    return await newLogger.save();
  }
  async getLoggers(){
    const loggers = await logger.find({})
    return loggers;
  }
}

module.exports = new LoggerService();