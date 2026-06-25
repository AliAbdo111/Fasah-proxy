// @ts-nocheck
/* Ported from services/loggerSerivce.js */
import logger from '../schemas/logger.schema';

class LoggerService {
  async createLogger(data: Record<string, unknown>) {
    const newLogger = new logger(data);
    return await newLogger.save();
  }
  async getLoggers() {
    return logger.find({});
  }

  async deleteAllLoggers() {
    const result = await logger.deleteMany({});
    return {
      deletedCount: result.deletedCount ?? (result as { n?: number }).n ?? 0
    };
  }
}

export default new LoggerService();