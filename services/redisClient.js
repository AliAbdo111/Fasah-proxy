const Redis = require('ioredis');

let redis = null;

/**
 * Shared Redis connection (singleton).
 * REDIS_URL unset → redis://127.0.0.1:6379 (docker-compose redis).
 * REDIS_URL=off → Redis disabled (schedule:appointments:save returns error).
 */
function getRedis() {
  const raw = process.env.REDIS_URL;
  if (raw !== undefined && String(raw).toLowerCase() === 'off') {
    return null;
  }
  const url = raw && String(raw).trim() ? raw : 'redis://127.0.0.1:6379';
  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true
    });
    redis.on('error', (err) => {
      console.error('[redis]', err.message);
    });
  }
  return redis;
}

module.exports = { getRedis };
