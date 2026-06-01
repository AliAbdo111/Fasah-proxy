const logger = require('../routes/models/logger');

class LoggerService {
  async createLogger(data) {
    const newLogger = new logger(data);
    return await newLogger.save();
  }
  async getLoggers() {
    const loggers = await logger.find({});
    return loggers;
  }

  async deleteAllLoggers() {
    const result = await logger.deleteMany({});
    return {
      deletedCount: result.deletedCount ?? result.n ?? 0
    };
  }
}

module.exports = new LoggerService();