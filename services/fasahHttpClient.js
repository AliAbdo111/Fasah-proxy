const { fetch, Agent, ProxyAgent } = require('undici');
const Bottleneck = require('bottleneck');
const pRetry = require('p-retry');

const sharedAgent = new Agent({
  connect: { rejectUnauthorized: false },
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
  connections: 128,
  pipelining: 1
});

const globalLimiter = new Bottleneck({
  maxConcurrent: parseInt(process.env.FASAH_GLOBAL_MAX_CONCURRENT || '10', 10),
  minTime: parseInt(process.env.FASAH_GLOBAL_MIN_TIME_MS || '50', 10)
});

const userLimiters = new Map();

function getUserLimiter(userId) {
  const key = String(userId || '__global__');
  if (!userLimiters.has(key)) {
    userLimiters.set(
      key,
      new Bottleneck({
        maxConcurrent: parseInt(process.env.FASAH_USER_MAX_CONCURRENT || '2', 10),
        minTime: parseInt(process.env.FASAH_USER_MIN_TIME_MS || '100', 10)
      })
    );
  }
  return userLimiters.get(key);
}

function appendQuery(url, query) {
  if (!query || typeof query !== 'object') return url;
  const u = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      u.searchParams.set(key, String(value));
    }
  }
  return u.toString();
}

function createProxyDispatcher(proxy) {
  const protocol = proxy.protocol || 'http';
  const auth =
    proxy.username || proxy.password
      ? `${encodeURIComponent(proxy.username || '')}:${encodeURIComponent(proxy.password || '')}@`
      : '';
  return new ProxyAgent(`${protocol}://${auth}${proxy.host}:${proxy.port}`);
}

async function undiciJsonRequest({
  method = 'GET',
  url,
  headers = {},
  query,
  body,
  dispatcher,
  timeoutMs = 30000
}) {
  const finalUrl = appendQuery(url, query);
  const opts = {
    method: method.toUpperCase(),
    headers: { ...headers },
    dispatcher: dispatcher || sharedAgent,
    signal: AbortSignal.timeout(timeoutMs)
  };

  if (body !== undefined && opts.method !== 'GET' && opts.method !== 'HEAD') {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!opts.headers['Content-Type'] && !opts.headers['content-type']) {
      opts.headers['Content-Type'] = 'application/json; charset=utf-8';
    }
  }

  const response = await fetch(finalUrl, opts);
  const contentType = response.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data };
}

function extractMessage(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const err = data.errors[0];
    if (err && (err.message || err.code)) return String(err.message || err.code).trim();
  }
  if (data.message) return String(data.message).trim();
  if (data.error) return String(data.error).trim();
  return '';
}

function isRateLimited(status, data) {
  if (status === 429) return true;
  const msg = extractMessage(data);
  if (!msg) return false;
  const raw = String(msg);
  const m = raw.toLowerCase();
  const ar = raw.replace(/\s+/g, ' ');
  return (
    (ar.includes('تجاوز') && ar.includes('حد')) ||
    ar.includes('الحد الاقصى') ||
    ar.includes('الحد الأقصى') ||
    m.includes('rate limit') ||
    m.includes('limit exceeded') ||
    m.includes('too many requests') ||
    m.includes('maximum')
  );
}

async function executeReliableRequest({
  userId,
  buildAttempt,
  maxRetries = parseInt(process.env.FASAH_RETRY_MAX || '3', 10),
  timeoutMs = parseInt(process.env.FASAH_REQUEST_TIMEOUT_MS || '30000', 10)
}) {
  const minTimeout = parseInt(process.env.FASAH_RETRY_MIN_MS || '300', 10);
  const maxTimeout = parseInt(process.env.FASAH_RETRY_MAX_MS || '1200', 10);

  return globalLimiter.schedule(() =>
    getUserLimiter(userId).schedule(() => {
      let attemptIndex = 0;
      return pRetry(
        async () => {
          const attempt = buildAttempt(attemptIndex);
          attemptIndex += 1;
          const { status, data } = await undiciJsonRequest({
            method: attempt.method,
            url: attempt.url,
            headers: attempt.headers,
            query: attempt.query,
            body: attempt.body,
            dispatcher: attempt.dispatcher,
            timeoutMs: attempt.timeoutMs || timeoutMs
          });

          if (status >= 500) {
            const err = new Error(`Upstream server error (${status})`);
            err.retryable = true;
            throw err;
          }

          if (isRateLimited(status, data)) {
            const err = new Error(extractMessage(data) || `Rate limited (${status})`);
            err.retryable = true;
            throw err;
          }

          return { status, data, viaVps: Boolean(attempt.viaVps) };
        },
        {
          retries: Math.max(0, maxRetries - 1),
          minTimeout,
          maxTimeout,
          randomize: true,
          onFailedAttempt: (error) => {
            console.log(
              `[fasahHttp] user=${userId} retry ${error.attemptNumber}/${maxRetries}: ${error.message}`
            );
          }
        }
      );
    })
  );
}

module.exports = {
  sharedAgent,
  createProxyDispatcher,
  undiciJsonRequest,
  executeReliableRequest,
  isRateLimited
};
