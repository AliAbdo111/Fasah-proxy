const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');
require('dotenv').config();
const loggerService = require('./loggerSerivce');

const MSG_SCHEDULE_NO_SLOTS = 'لا يوجد مواعيد متاحة';
const MSG_CREATE_FASAH_ERROR = 'حدث خطا علي منصة فسح';

function extractFasahMessage(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const err = data.errors[0];
    if (err && (err.message || err.code)) return String(err.message || err.code).trim();
  }
  if (data.message) return String(data.message).trim();
  if (data.data && typeof data.data === 'object') {
    const nested = extractFasahMessage(data.data);
    if (nested) return nested;
  }
  if (data.error) return String(data.error).trim();
  return '';
}

function isMaxLimitExceededMessage(message) {
  if (!message) return false;
  const raw = String(message);
  const m = raw.toLowerCase();
  const normalizedAr = raw.replace(/\s+/g, ' ');
  return (
    (normalizedAr.includes('تجاوز') && normalizedAr.includes('حد')) ||
    normalizedAr.includes('الحد الاقصى') ||
    normalizedAr.includes('الحد الأقصى') ||
    m.includes('rate limit') ||
    m.includes('limit exceeded') ||
    m.includes('too many requests') ||
    m.includes('maximum')
  );
}

function mapFasahUserMessage(originalMessage, context) {
  if (!originalMessage) return originalMessage;
  if (!isMaxLimitExceededMessage(originalMessage)) return originalMessage;
  if (context === 'schedule') return MSG_SCHEDULE_NO_SLOTS;
  if (context === 'create') return MSG_CREATE_FASAH_ERROR;
  return originalMessage;
}

function normalizeFasahResponse(data, context) {
  if (!data || typeof data !== 'object') return data;
  const originalMessage = extractFasahMessage(data);
  const userMessage = mapFasahUserMessage(originalMessage, context);
  if (!userMessage) return data;

  const out = { ...data, message: userMessage };
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    out.errors = data.errors.map((err, index) =>
      index === 0 ? { ...err, message: userMessage } : { ...err }
    );
  } else if (data.success === false) {
    out.errors = [{ message: userMessage }];
  }
  return out;
}

class FasahClient {
  constructor() {
    this.loggerService = loggerService;
    // Support both broker and transporter endpoints
    this.brokerBaseUrl = process.env.FASAH_BROKER_BASE_URL || 'https://fasah.zatca.gov.sa';
    this.transporterBaseUrl = process.env.FASAH_TRANSPORTER_BASE_URL || 'https://oga.fasah.sa';
    this.apiPath = '/api/zatca-tas/v2';

    // When true, outbound calls use `platformProxies` (env only; user proxyEnabled / user.proxies are ignored).
    this.platformProxyEnabled = String(process.env.FASAH_USE_PROXY || 'false').toLowerCase() === 'true';

    // For better TLS support, use HTTPS proxy protocol (protocol: 'https')
    // and set rejectUnauthorized: true if the provider uses trusted certificates
    this.platformProxies = [
      { host: '104.252.97.205', port: 6075, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '82.23.57.28', port: 7282, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '179.61.172.103', port: 6654, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '104.252.81.66', port: 5937, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '82.22.96.18', port: 7726, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '159.148.239.193', port: 6745, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '46.203.41.162', port: 5663, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '46.203.76.74', port: 6574, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '46.203.60.11', port: 7011, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '82.23.57.84', port: 7338, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '82.140.180.234', port: 7194, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '159.148.236.206', port: 6412, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '212.212.18.184', port: 6835, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '212.212.19.32', port: 6183, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '104.252.81.104', port: 5975, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '104.252.62.44', port: 5415, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '104.252.75.237', port: 5607, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '104.252.62.251', port: 5622, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '212.212.19.239', port: 6390, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false },
      { host: '212.212.18.236', port: 6887, username: 'wjlsvmlc', password: 'e9m2qtqzoujk', protocol: 'http', rejectUnauthorized: false }
    ];

    // Optional per-user proxy pools (hardcoded). If a request has `proxyContext._id` that matches,
    // that user's pool is used; otherwise we fall back to `platformProxies`.
    this.userProxyPoolsById = new Map();
    
    // Rotation index for the shared platform proxy pool.
    this.proxyRotationMap = new Map();
  }

  /**
   * Next entry from hardcoded pools.
   * Always uses `platformProxies` (rotates on key `__platform__`).
   */
  getNextPlatformProxy(proxyContext) {
    const proxies = this.platformProxies.map((p) => this.normalizeProxyEntry(p)).filter(Boolean);
    if (proxies.length === 0) return null;
    return this.getNextProxy('__platform__', proxies);
  }

  /**
   * Advance rotation for a given pool key and proxies array (internal; prefer {@link getNextPlatformProxy}).
   * @returns {Object|null} Proxy configuration
   */
  getNextProxy(poolKey, proxies) {
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return this.getNextPlatformProxy();
    }
    const key = String(poolKey || '__platform__');
    const currentIndex = this.proxyRotationMap.get(key) || 0;
    const normalizedIndex = ((currentIndex % proxies.length) + proxies.length) % proxies.length;
    const proxy = proxies[normalizedIndex];
    this.proxyRotationMap.set(key, (normalizedIndex + 1) % proxies.length);
    return proxy;
  }

  normalizeProxyEntry(proxy) {
    if (!proxy || typeof proxy !== 'object') return null;
    const host = String(proxy.host || '').trim();
    const port = Number(proxy.port);
    if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return {
      host,
      port,
      username: String(proxy.username || '').trim(),
      password: String(proxy.password || '').trim(),
      protocol: String(proxy.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http',
      rejectUnauthorized: Boolean(proxy.rejectUnauthorized)
    };
  }

  /** Only `FASAH_USE_PROXY`; ignores per-user `proxyEnabled` and any user-stored proxy list. */
  shouldUseProxy() {
    return Boolean(this.platformProxyEnabled);
  }

  /**
   * Create proxy agent for axios
   * @param {Object} proxyConfig - Proxy configuration
   * @param {string} proxyConfig.host - Proxy host
   * @param {number} proxyConfig.port - Proxy port
   * @param {string} proxyConfig.username - Proxy username
   * @param {string} proxyConfig.password - Proxy password
   * @param {string} [proxyConfig.protocol='http'] - Proxy protocol: 'http' or 'https'
   * @returns {HttpsProxyAgent} Proxy agent
   */
  createProxyAgent(proxyConfig) {
    // Support both HTTP and HTTPS proxy protocols
    const protocol = proxyConfig.protocol || 'http';
    const proxyUrl = `${protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    
    // Configure TLS options - rejectUnauthorized must be false for proxies with self-signed certs
    const rejectUnauthorized = proxyConfig.rejectUnauthorized !== undefined 
      ? proxyConfig.rejectUnauthorized 
      : false;
    
    // Create proxy agent with TLS configuration
    // For https-proxy-agent v7.x, options are passed directly
    const agentOptions = {
      rejectUnauthorized: rejectUnauthorized,
      keepAlive: true
    };
    
    const agent = new HttpsProxyAgent(proxyUrl, agentOptions);
    
    // Patch the agent to ensure TLS options are applied to the target connection
    // This is needed because the proxy agent creates a tunnel, then establishes TLS
    const originalCreateConnection = agent.createConnection;
    if (originalCreateConnection) {
      agent.createConnection = function(options, callback) {
        // Ensure rejectUnauthorized is set for the TLS connection to the target server
        if (options && typeof options === 'object') {
          options.rejectUnauthorized = rejectUnauthorized;
        }
        return originalCreateConnection.call(this, options, callback);
      };
    }
    
    return agent;
  }

  /**
   * Execute axios request with optional rotating proxy.
   * Ensures every request can use one proxy from the list when enabled.
   */
  async performRequest(method, url, config = {}, body = undefined, proxyLogLabel = '', proxyContext = undefined) {
    const axiosConfig = { ...config };

    if (this.shouldUseProxy(proxyContext)) {
      const proxy = this.getNextPlatformProxy(proxyContext);
      if (proxy) {
        axiosConfig.httpsAgent = this.createProxyAgent(proxy);
        const label = proxyLogLabel ? ` (${proxyLogLabel})` : '';
        console.log(`Using proxy${label}: ${proxy.host}:${proxy.port}`);
      }
    }
    if (!axiosConfig.httpsAgent) {
      axiosConfig.httpsAgent = this.keepAliveHttpsAgent;
    }

    const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      if (method === 'post') {
        return await axios.post(url, body, axiosConfig);
      }
      return await axios.get(url, axiosConfig);
    } finally {
      if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
      else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  }
 
  /**
   * Get schedule for land zone
   * @param {Object} params - Query parameters
   * @param {string} params.departure - Departure code (e.g., 'AGF')
   * @param {string} params.arrival - Arrival zone code (e.g., '31')
   * @param {string} params.type - Schedule type (e.g., 'TRANSIT')
   * @param {string} [params.economicOperator] - Economic operator code (optional)
   * @param {string} [params.token] - Bearer token for authentication
   * @param {string} [params.userType] - User type: 'broker' or 'transporter' (default: 'broker')
   * @returns {Promise<Object>} Schedule data
   */
  async getLandSchedule(params) {
    try {
      const { departure, arrival, type, economicOperator = '', token, userType = 'broker' } = params;

      // Validate required parameters
      if (!departure || !arrival || !type) {
        throw new Error('Missing required parameters: departure, arrival, and type are required');
      }

      if (!token) {
        throw new Error('Authentication token is required');
      }

      // Select base URL based on user type
      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}${this.apiPath}/zone/schedule/land`;

      // Build query parameters
      const queryParams = {
        departure,
        arrival,
        type,
        ...(economicOperator && { economicOperator })
      };

      // Prepare headers
      const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}` // Ensure Bearer prefix
      };
      console.log('headers', headers);

      const axiosConfig = {
        params: queryParams,
        headers,
        timeout: 30000,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy: ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          console.log('response', response.data);
          return normalizeFasahResponse(response.data, 'schedule');
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }
      

      const response = await axios.get(url, axiosConfig);
      return normalizeFasahResponse(response.data, 'schedule');

    } catch (error) {
      console.log(error);
      this.handleError(error);
    }
  }

  async getLandScheduleSix(params) {
    try {
      const { finalDest = 31, type='TRANSIT', userType = 'broker', token } = params;

      // Validate required parameters
      if (!finalDest || !type) {
        throw new Error('Missing required parameters: finalDest and type are required');
      }

      if (!token) {
        throw new Error('Authentication token is required');
      }

      // Select base URL based on user type
      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}${this.apiPath}/zone/schedule/land`;

      // Build query parameters
      const queryParams = {
          finalDest,
          type
      };

      // Prepare headers
      const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}` // Ensure Bearer prefix
      };
      console.log('headers', headers);

      const axiosConfig = {
        params: queryParams,
        headers,
        timeout: 30000,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy()) {
        const proxy = this.resolvePlatformProxy(params);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy: ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          console.log('[fasahClient] getLandSchedule response', response.data);
          console.log('[fasahClient] getLandSchedule status text', response.status);
          return normalizeFasahResponse(response.data, 'schedule');
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }
      

      const response = await axios.get(url, axiosConfig);
      return normalizeFasahResponse(response.data, 'schedule');

    } catch (error) {
      console.log(error);
      this.handleError(error);
    }
  }
  /**
   * GET /api/zatca-fleet/v1/lookup/resident/countries
   * @param {Object} params
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - optional query string params forwarded upstream
   */
  async getFleetResidentCountriesLookup(params) {
    try {
      const { token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}/api/zatca-fleet/v1/lookup/resident/countries`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (fleet lookup): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * GET /api/zatca-fleet/v1/nationality
   * @param {Object} params
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - optional query string params forwarded upstream
   */
  async getFleetNationalityLookup(params) {
    try {
      const { token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}/api/zatca-fleet/v1/nationality`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (fleet nationality): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * GET /api/zatca-fleet/v1/lookup/truck/colors
   * @param {Object} params
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - optional query string params (e.g. q) forwarded upstream
   */
  async getFleetTruckColorsLookup(params) {
    try {
      const { token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}/api/zatca-fleet/v1/lookup/truck/colors`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (fleet truck colors): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * GET /api/zatca-fleet/v2/truck/lookup/brands
   * @param {Object} params
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - optional query string params (e.g. q) forwarded upstream
   */
  async getFleetV2TruckBrandsLookup(params) {
    try {
      const { token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}/api/zatca-fleet/v2/truck/lookup/brands`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (fleet v2 truck brands): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * GET /api/zatca-fleet/v2/truck/lookup/models/:brandCode
   * @param {Object} params
   * @param {string} params.brandCode - brand id in path (e.g. "1")
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - optional query string params (e.g. q) forwarded upstream
   */
  async getFleetV2TruckModelsLookup(params) {
    try {
      const { brandCode, token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }
      if (brandCode === undefined || brandCode === null || String(brandCode).trim() === '') {
        throw new Error('brandCode is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const encoded = encodeURIComponent(String(brandCode));
      const url = `${baseUrl}/api/zatca-fleet/v2/truck/lookup/models/${encoded}`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (fleet v2 truck models): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * GET /api/zatca-tas/customs/forigen/driver-truck-info
   * @param {Object} params
   * @param {string} params.token
   * @param {string} [params.userType='broker']
   * @param {Object} [params.query] - query string forwarded upstream (e.g. purpose, consignmentNumber)
   */
  async getZatcaTasCustomsForeignDriverTruckInfo(params) {
    try {
      const { token, userType = 'broker', query = {} } = params;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
      const url = `${baseUrl}/api/zatca-tas/customs/forigen/driver-truck-info`;

      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'ar',
        'Content-Type': 'application/json; charset=utf-8',
        token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
      };

      const axiosConfig = {
        params: query,
        headers,
        timeout: 30000,
        validateStatus(status) {
          return status >= 200 && status < 500;
        }
      };

      if (this.shouldUseProxy(params.proxyContext)) {
        const proxy = this.getNextPlatformProxy(params.proxyContext);
        if (proxy) {
          axiosConfig.httpsAgent = this.createProxyAgent(proxy);
          console.log(`Using proxy (zatca-tas customs driver-truck-info): ${proxy.host}:${proxy.port}`);
        }
        const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        try {
          const response = await axios.get(url, axiosConfig);
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          return response.data;
        } catch (err) {
          if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
          else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          throw err;
        }
      }

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
 * Get a paginated list of verified drivers for a specific port and appointment time.
 * @param {Object} params - Query parameters and authentication
 * @param {string} params.port - The port/zone code (e.g., '31')
 * @param {string} params.appointmentTime - Appointment date in YYYY/MM/DD format
 * @param {string} params.token - Bearer token for authentication
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.size=10] - Number of items per page
 * @param {string} [params.order='desc'] - Sort order: 'asc' or 'desc'
 * @param {string} [params.sortby='licenseNo'] - Field to sort by
 * @param {string} [params.q=''] - Search query string
 * @param {string} [params.userType='transporter'] - User type, defaults to 'transporter' for this endpoint
 * @returns {Promise<Object>} Paginated list of verified drivers
 */
async getVerifiedDrivers(params) {
  try {
    const {
      port,
      appointmentTime,
      token,
      page = 1,
      size = 10,
      order = 'desc',
      sortby = 'licenseNo',
      q = '',
      localTrucks,
      userType = 'transporter' // This endpoint is specific to transporter portal
    } = params;

    // Validate required parameters
    if (!port || !appointmentTime) {
      throw new Error('Missing required parameters: port and appointmentTime are required');
    }
    if (!token) {
      throw new Error('Authentication token is required');
    }

    // Select base URL based on user type
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-fleet/v2/driver/verified/all/forAdd`;

    // Build query parameters matching the curl request
    const queryParams = {
      port,
      appointmentTime,
      page,
      size,
      order,
      sortby,
      q
    };
    if (localTrucks !== undefined && localTrucks !== '') {
      queryParams.localTrucks =
        localTrucks === true || localTrucks === 'true' || localTrucks === '1';
    }

    // Prepare headers (matching the curl request)
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}` // Ensure Bearer prefix
    };

    const response = await this.performRequest('get', url, {
      params: queryParams,
      headers,
      timeout: 30000,
      validateStatus(status) {
        return status >= 200 && status < 500;
      }
    }, undefined, 'verified drivers', params.proxyContext);
    return response.data;

  } catch (error) {
    // Use the existing error handling logic
    this.handleError(error);
  }
}

/**
 * الحصول على قائمة الشاحنات المرخصة لميناء وتاريخ محدد
 * @param {Object} params - معاملات البحث والمصادقة
 * @param {string} params.port - رمز الميناء/المنطقة (مثال: '31')
 * @param {string} params.appointmentTime - تاريخ الموعد بتنسيق YYYY/MM/DD
 * @param {string} params.token - رمز المصادقة
 * @param {number} [params.page=1] - رقم الصفحة
 * @param {number} [params.size=10] - عدد العناصر في الصفحة
 * @param {string} [params.order='desc'] - ترتيب العرض: 'asc' أو 'desc'
 * @param {string} [params.sortby='plateNumberEn'] - الحقل للترتيب حسبه
 * @param {string} [params.q=''] - نص البحث
 * @param {string} [params.userType='transporter'] - نوع المستخدم
 * @returns {Promise<Object>} قائمة الشاحنات
 */
async getVerifiedTrucks(params) {
  try {
    const {
      port,
      appointmentTime,
      token,
      page = 1,
      size = 10,
      order = 'desc',
      sortby = 'plateNumberEn',
      q = '',
      localTrucks,
      userType = 'transporter'
    } = params;

    // التحقق من المعاملات المطلوبة
    if (!port || !appointmentTime) {
      throw new Error('معاملات مطلوبة: port و appointmentTime إجباريان');
    }
    if (!token) {
      throw new Error('رمز المصادقة مطلوب');
    }

    // اختيار الرابط حسب نوع المستخدم
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-fleet/v2/truck/verified/all/forAdd`;

    // بناء معاملات البحث
    const queryParams = {
      port,
      appointmentTime,
      page,
      size,
      order,
      sortby,
      q
    };
    if (localTrucks !== undefined && localTrucks !== '') {
      queryParams.localTrucks =
        localTrucks === true || localTrucks === 'true' || localTrucks === '1';
    }

    // إعداد الهيدرات (نفس إعدادات السائقين)
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };
    const response = await this.performRequest('get', url, {
      params: queryParams,
      headers,
      validateStatus(status) {
        return status >= 200 && status < 500;
      }
    }, undefined, 'verified trucks', params.proxyContext);
    return response.data;

  } catch (error) {
    this.handleError(error);
  }
}

/**
 * إنشاء موعد جديد للنقل العابر
 * @param {Object} params - معاملات إنشاء الموعد
 * @param {string} params.port_code - رمز الميناء (مثال: '31')
 * @param {string} params.zone_schedule_id - معرف جدول المنطقة
 * @param {string} params.purpose - رمز الغرض (مثال: '6')
 * @param {string} params.declaration_number - رقم البيان الجمركي
 * @param {Array} params.fleet_info - معلومات الأسطول (السائق والمركبة)
 * @param {string} params.cargo_type - نوع البضاعة (يمكن أن يكون فارغاً)
 * @param {Object} params.bayan_appointment - معلومات موعد البيان (يمكن أن يكون فارغاً)
 * @param {string} params.token - رمز المصادقة
 * @param {string} [params.userType='broker'] - نوع المستخدم (broker لهذا API)
 * @returns {Promise<Object>} نتيجة إنشاء الموعد
 */
async createTransitAppointment(params) {
  try {
    const {
      port_code,
      zone_schedule_id,
      purpose,
      declaration_number,
      fleet_info,
      cargo_type = '',
      bayan_appointment = {},
      token,
      userType = 'broker'
    } = params;

    // التحقق من المعاملات المطلوبة
    const requiredParams = ['port_code', 'zone_schedule_id', 'purpose', 'declaration_number', 'fleet_info'];
    const missingParams = requiredParams.filter(param => !params[param]);
    
    if (missingParams.length > 0) {
      throw new Error(`معاملات مطلوبة مفقودة: ${missingParams.join(', ')}`);
    }
    
    if (!token) {
      throw new Error('رمز المصادقة مطلوب');
    }

    // التحقق من fleet_info
    if (!Array.isArray(fleet_info) || fleet_info.length === 0) {
      throw new Error('fleet_info يجب أن يكون مصفوفة تحتوي على معلومات السائق والمركبة');
    }

    // اختيار الرابط حسب نوع المستخدم
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-tas/v2/appointment/transit/create`;

    // بناء بيانات الطلب
    const requestData = {
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type,
      fleet_info,
      bayan_appointment,
      declaration_number
    };

    // إعداد الهيدرات
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=UTF-8',
      'Origin': baseUrl,
      'Referer': `${baseUrl}/ar/broker/2.0/`,
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };

    const postConfig = {
      headers,
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    };
    if (this.shouldUseProxy(params.proxyContext)) {
      const proxy = this.getNextPlatformProxy(params.proxyContext);
      if (proxy) {
        postConfig.httpsAgent = this.createProxyAgent(proxy);
        console.log(`Using proxy for create appointment: ${proxy.host}:${proxy.port}`);
      }
      await loggerService.createLogger({
        message: proxy ? `Create transit appointment via proxy: ${proxy.host}:${proxy.port}` : 'Create transit appointment via proxy: (no proxy available)',
        data: { requestData },
        type: 'info_request'
      });
      const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      try {
        const response = await axios.post(url, requestData, postConfig);
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
        return normalizeFasahResponse(response.data, 'create');
      } catch (error) {
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        this.loggerService.createLogger({ message: `Create transit appointment error: ${error}`, data: { error: String(error) }, type: 'error' });
        throw error;
      }
    }
    const response = await axios.post(url, requestData, postConfig);
    await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
    return normalizeFasahResponse(response.data, 'create');

  } catch (error) {
    this.loggerService.createLogger({
      message: `📅 خطأ في إنشاع موعد نقل عابر باستخدام البروكسي ${error}`,
      data: {
        error: JSON.stringify(error)
      },
      type: 'error'
    });
    this.handleError(error);
  }
}


async createNonDeclarationAppointment(params) {
  try {
    const {
      port_code,
      zone_schedule_id,
      purpose,
      fleet_info,
      cargo_type = '',
      bayan_appointment = {},
      token,
      userType = 'broker'
    } = params;

    // التحقق من المعاملات المطلوبة
    const requiredParams = ['port_code', 'zone_schedule_id', 'purpose', 'fleet_info'];
    const missingParams = requiredParams.filter(param => !params[param]);
    
    if (missingParams.length > 0) {
      throw new Error(`معاملات مطلوبة مفقودة: ${missingParams.join(', ')}`);
    }
    
    if (!token) {
      throw new Error('رمز المصادقة مطلوب');
    }

    // التحقق من fleet_info
    if (!Array.isArray(fleet_info) || fleet_info.length === 0) {
      throw new Error('fleet_info يجب أن يكون مصفوفة تحتوي على معلومات السائق والمركبة');
    }

    // اختيار الرابط حسب نوع المستخدم
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-tas/v2/appointment/non-declaration/create`;

    // بناء بيانات الطلب
    const requestData = {
      port_code,
      zone_schedule_id,
      purpose,
      cargo_type,
      fleet_info,
      bayan_appointment
    };

    // إعداد الهيدرات
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=UTF-8',
      'Origin': baseUrl,
      'Referer': `${baseUrl}/ar/broker/2.0/`,
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };

    const postConfig = {
      headers,
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    };
    if (this.shouldUseProxy(params.proxyContext)) {
      const proxy = this.getNextPlatformProxy(params.proxyContext);
      if (proxy) {
        postConfig.httpsAgent = this.createProxyAgent(proxy);
        console.log(`Using proxy for create appointment: ${proxy.host}:${proxy.port}`);
      }
      await loggerService.createLogger({
        message: proxy ? `Create transit appointment via proxy: ${proxy.host}:${proxy.port}` : 'Create transit appointment via proxy: (no proxy available)',
        data: { requestData },
        type: 'info_request'
      });
      const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      try {
        const response = await axios.post(url, requestData, postConfig);
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
        return normalizeFasahResponse(response.data, 'create');
      } catch (error) {
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        this.loggerService.createLogger({ message: `Create transit appointment error: ${error}`, data: { error: String(error) }, type: 'error' });
        throw error;
      }
    }
    const response = await axios.post(url, requestData, postConfig);
    await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
    return normalizeFasahResponse(response.data, 'create');

  } catch (error) {
    this.loggerService.createLogger({
      message: `📅 خطأ في إنشاع موعد نقل عابر باستخدام البروكسي ${error}`,
      data: {
        error: JSON.stringify(error)
      },
      type: 'error'
    });
    this.handleError(error);
  }
}

/**
 * Create land appointment (ZATCA TAS v2)
 * @param {Object} params
 * @param {Object} params.body - JSON body as required by upstream (e.g. arraival_port, zone_schedule_id, fleetInformation, …)
 * @param {string} params.token - Bearer token
 * @param {string} [params.userType='broker'] - broker | transporter
 */
async createLandAppointment({ body, token, userType = 'broker', proxyContext }) {
  try {
    if (!token) {
      throw new Error('رمز المصادقة مطلوب');
    }
    if (!body || typeof body !== 'object') {
      throw new Error('Request body is required');
    }

    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-tas/v2/appointment/land/create`;

    const headers = {
      Accept: 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=UTF-8',
      Origin: baseUrl,
      Referer: `${baseUrl}/ar/broker/2.0/`,
      token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };

    const postConfig = {
      headers,
      timeout: 30000,
      validateStatus(status) {
        return status >= 200 && status < 500;
      }
    };

    if (this.shouldUseProxy(proxyContext)) {
      const proxy = this.getNextPlatformProxy(proxyContext);
      if (proxy) {
        postConfig.httpsAgent = this.createProxyAgent(proxy);
        console.log(`Using proxy for create land appointment: ${proxy.host}:${proxy.port}`);
      }
      await loggerService.createLogger({
        message: proxy ? `Create land appointment via proxy: ${proxy.host}:${proxy.port}` : 'Create land appointment via proxy: (no proxy available)',
        data: { body },
        type: 'info_request'
      });
      const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      try {
        const response = await axios.post(url, body, postConfig);
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        await loggerService.createLogger({
          message: 'Create land appointment response',
          data: { response: response.data },
          type: 'info_response'
        });
        return normalizeFasahResponse(response.data, 'create');
      } catch (error) {
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        this.loggerService.createLogger({
          message: `Create land appointment error: ${error}`,
          data: { error: String(error) },
          type: 'error'
        });
        throw error;
      }
    }

    const response = await axios.post(url, body, postConfig);
    await loggerService.createLogger({
      message: 'Create land appointment response',
      data: { response: response.data },
      type: 'info_response'
    });
    return normalizeFasahResponse(response.data, 'create');
  } catch (error) {
    this.loggerService.createLogger({
      message: `Land appointment create error: ${error}`,
      data: { error: JSON.stringify(error) },
      type: 'error'
    });
    this.handleError(error);
  }
}

/**
 * Validate declaration number / get declaration info for transit appointment
 * @param {Object} params
 * @param {string} params.decNo - Declaration number
 * @param {string} params.arrivalPort - Arrival port code (e.g. '31')
 * @param {string} params.token - Bearer token
 * @param {string} [params.userType='broker'] - 'broker' or 'transporter'
 * @returns {Promise<Object>}
 */
async getDeclarationInfo(params) {
  try {
    const { decNo, arrivalPort, token, userType = 'broker' } = params;
    if (!decNo || !arrivalPort) {
      throw new Error('Missing required parameters: decNo and arrivalPort are required');
    }
    if (!token) {
      throw new Error('Authentication token is required');
    }
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}${this.apiPath}/appointment/transit/getDeclarationInfo`;
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };
    const response = await this.performRequest('get', url, {
      params: { decNo, arrivalPort },
      headers,
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 500
    }, undefined, 'declaration info', params.proxyContext);
    return response.data;
  } catch (error) {
    this.handleError(error);
  }
}

/**
 * GET /api/zatca-tas/v2/appointment/bulk/getDeclarationInfo
 * @param {Object} params
 * @param {string} params.token
 * @param {string} [params.userType='broker']
 * @param {Object} params.query - forwarded as axios params (decNo, port, purpose, toRefNo, …)
 */
async getBulkDeclarationInfo(params) {
  try {
    const { token, userType = 'broker', query = {} } = params;
    if (!token) {
      throw new Error('Authentication token is required');
    }
    const decNo = query.decNo;
    const port = query.port;
    if (!decNo || !port) {
      throw new Error('Missing required parameters: decNo and port are required');
    }
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}${this.apiPath}/appointment/bulk/getDeclarationInfo`;
    const headers = {
      Accept: 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      token: `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };
    const response = await this.performRequest('get', url, {
      params: query,
      headers,
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 500
    }, undefined, 'bulk declaration info', params.proxyContext);
    return response.data;
  } catch (error) {
    this.handleError(error);
  }
}

/**
 * Generate land appointment PDF (ZATCA v1)
 * @param {Object} params
 * @param {string} params.ref - Appointment reference (e.g. TAS20260316234829745)
 * @param {string} params.token - Bearer token
 * @param {string} [params.userType='broker'] - 'broker' or 'transporter'
 * @returns {Promise<{ data: Buffer, contentType: string }|Object>} PDF buffer and content-type, or error payload
 */
async getLandAppointmentPdf(params) {
  try {
    const { ref, token, userType = 'broker' } = params;
    if (!ref || !token) {
      throw new Error('ref and token are required');
    }
    const baseUrl = userType === 'transporter' ? this.transporterBaseUrl : this.brokerBaseUrl;
    const url = `${baseUrl}/api/zatca-tas/v1/appoint/pdf/generateLand`;
    const headers = {
      'Accept': 'application/pdf, application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };
    const axiosConfig = {
      params: { ref },
      headers,
      timeout: 30000,
      responseType: 'arraybuffer',
      validateStatus: (status) => status >= 200 && status < 500
    };
    const response = await this.performRequest('get', url, axiosConfig, undefined, 'land appointment pdf', params.proxyContext);
    const responseContentType = (response.headers['content-type'] || '').toLowerCase();
    if (response.status >= 400) {
      const data = Buffer.isBuffer(response.data) ? response.data.toString('utf8') : response.data;
      let parsed;
      try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (_) {
        parsed = { message: data };
      }
      const err = new Error(parsed.message || `Request failed with ${response.status}`);
      err.status = response.status;
      err.data = parsed;
      throw err;
    }
    // Upstream may return JSON with base64 PDF, or raw PDF (sometimes with wrong content-type)
    const rawBytes = response.data;
    const firstByte = Buffer.isBuffer(rawBytes) ? rawBytes[0] : (rawBytes && new Uint8Array(rawBytes)[0]);
    const looksLikeJson = firstByte === 0x7b; // '{'
    if (looksLikeJson) {
      const raw = Buffer.isBuffer(rawBytes) ? rawBytes.toString('utf8') : String(rawBytes);
      let json;
      try {
        json = JSON.parse(raw);
      } catch (_) {
        return { data: rawBytes, contentType: 'application/pdf' };
      }
      const base64Pdf = json.pdf || json.data || json.content || json.file || json.base64 || json.fileContent || json.pdfBase64;
      if (base64Pdf && typeof base64Pdf === 'string') {
        return { data: Buffer.from(base64Pdf, 'base64'), contentType: 'application/pdf' };
      }
      if (json.success === false && (json.errors || json.message)) {
        const err = new Error(json.message || (json.errors && json.errors[0] && json.errors[0].message) || 'PDF generation failed');
        err.status = 400;
        err.data = json;
        throw err;
      }
    }
    // Raw PDF (or unknown binary): always use application/pdf so client displays correctly
    const contentType = responseContentType.includes('application/pdf')
      ? responseContentType
      : 'application/pdf';
    return { data: rawBytes, contentType };
  } catch (error) {
    this.handleError(error);
  }
}

  /**
   * Handle API errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const status = error.response.status;
      const data = error.response.data;
      
      let message = 'Unknown error';
      
      // Try to extract error message from response
      if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        message = data.errors[0].message || data.errors[0].code || 'Unknown error';
      } else if (data?.message) {
        message = data.message;
      } else if (data?.error) {
        message = data.error;
      } else if (typeof data === 'string') {
        message = data;
      }

      // Status-specific error messages
      if (status === 400) {
        message = `Bad request: ${message}`;
      } else if (status === 401) {
        message = 'Unauthorized - Invalid or expired token';
      } else if (status === 403) {
        message = 'Forbidden - Insufficient permissions';
      } else if (status === 404) {
        message = 'Resource not found';
      } else if (status === 429) {
        message = data.message || 'Too many requests - Rate limit exceeded';
      } else if (status >= 500) {
        message = 'Server error - Please try again later';
      }

      const apiError = new Error(`FASAH API error (${status}): ${message}`);
      apiError.status = status;
      apiError.data = data;
      throw apiError;
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response received from FASAH API');
      
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Request setup error: ${JSON.stringify(error.message)}`);

    }
  }
}

module.exports = FasahClient;
module.exports.extractFasahMessage = extractFasahMessage;
module.exports.normalizeFasahResponse = normalizeFasahResponse;

