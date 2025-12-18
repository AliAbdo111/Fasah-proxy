const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');
require('dotenv').config();
const loggerService = require('./loggerSerivce');

class FasahClient {
  constructor() {
    this.loggerService = loggerService;
    // Support both broker and transporter endpoints
    this.brokerBaseUrl = process.env.FASAH_BROKER_BASE_URL || 'https://fasah.zatca.gov.sa';
    this.transporterBaseUrl = process.env.FASAH_TRANSPORTER_BASE_URL || 'https://oga.fasah.sa';
    this.apiPath = '/api/zatca-tas/v2';
    
    
    // For better TLS support, use HTTPS proxy protocol (protocol: 'https')
    // and set rejectUnauthorized: true if the provider uses trusted certificates
    this.proxies = [
  
{
        host: '195.40.62.130',
        port: 7351,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.92',
        port: 7312,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.202',
        port: 7422,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.62.86',
        port: 7307,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.120.163',
        port: 7033,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.114.166',
        port: 6536,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.62.234',
        port: 7455,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.121.116',
        port: 6987,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.120.140',
        port: 7010,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.50',
        port: 7270,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.121.41',
        port: 6912,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.99.107',
        port: 6478,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.42',
        port: 7262,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.204',
        port: 7424,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.99.158',
        port: 6529,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.120',
        port: 7340,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.108',
        port: 7328,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.120.94',
        port: 6964,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.121.190',
        port: 7061,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.233',
        port: 7453,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      } 
, {
        host: '104.252.121.216',
        port: 7087,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '195.40.63.68',
        port: 7288,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.121.199',
        port: 7070,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.121.37',
        port: 6908,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      },
{
        host: '104.252.120.158',
        port: 7028,
        username: 'ucqikpgn',
        password: 'seoerggxfamv',
        protocol: 'http',
        rejectUnauthorized: false
      }

    ];
    
    // Proxy rotation index
    this.currentProxyIndex = 0;
  }

  /**
   * Get next proxy in rotation
   * @returns {Object} Proxy configuration
   */
  getNextProxy() {
    const proxy = this.proxies[this.currentProxyIndex];
    // Rotate to next proxy
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    return proxy;
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
      rejectUnauthorized: rejectUnauthorized
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
      // Get next proxy in rotation
      const proxy = this.getNextProxy();
      const httpsAgent = this.createProxyAgent(proxy);
      
      console.log(`🔄 Using proxy: ${proxy.username}@${proxy.host}:${proxy.port}`);

            const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      const shouldRejectUnauthorized = proxy.rejectUnauthorized !== undefined 
        ? proxy.rejectUnauthorized 
        : false; // Default to false for compatibility
      
      if (!shouldRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }

      try {
        const response = await axios.get(url, {
          params: queryParams,
          headers,
          httpsAgent,
          timeout: 30000, // 30 seconds timeout
          // Also configure axios to accept self-signed certificates
          validateStatus: function (status) {
            return status >= 200 && status < 500; // Accept 4xx as valid responses
          }
        });
        console.log('response', response.data);
        // Restore original setting
        if (originalRejectUnauthorized !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
        
        return response.data;
      } catch (error) {
        // Restore original setting on error
        if (originalRejectUnauthorized !== undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        } else {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        }
        throw error;
      }

    } catch (error) {
      console.log(error);
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

    // Prepare headers (matching the curl request)
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}` // Ensure Bearer prefix
    };

    try {
      const response = await axios.get(url, {
        params: queryParams,
        headers,
        timeout: 30000, // 30 seconds timeout
        // Accept both successful and client error responses
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });
      
      return response.data;
    } catch (error) {
      // Restore original setting on erro
      throw error;
    }

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

    // إعداد الهيدرات (نفس إعدادات السائقين)
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Content-Type': 'application/json; charset=utf-8',
      'token': `Bearer ${token.replace(/^Bearer\s+/i, '')}`
    };


    try {
      const response = await axios.get(url, {
        params: queryParams,
        headers,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });

   
      
      return response.data;
    } catch (error) {
      throw error;
    }

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

    // استخدام البروكسي
    const proxy = this.getNextProxy();
    const httpsAgent = this.createProxyAgent(proxy);
    
    console.log(`📅 إنشاء موعد نقل عابر باستخدام البروكسي: ${proxy.username}@${proxy.host}:${proxy.port}`);
    await loggerService.createLogger({
      message: `📅 إنشاع موعد نقل عابر باستخدام البروكسي: ${proxy.username}@${proxy.host}:${proxy.port}`,
      data: {
        proxy: proxy,
        requestData: requestData
      },
      type: 'info_request'
    });
    // إعدادات TLS للبروكسي
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const shouldRejectUnauthorized = proxy.rejectUnauthorized !== undefined 
      ? proxy.rejectUnauthorized 
      : false;
    
    if (!shouldRejectUnauthorized) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    try {
      const response = await axios.post(url, requestData, {
        headers,
        // httpsAgent,
        timeout: 30000,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });
      await loggerService.createLogger({
        message: `📅تم طلب حجز موعد بجاح موعد نقل عابر باستخدام البروكسي: ${proxy.username}@${proxy.host}:${proxy.port}`,
        data: {
          response: response.data
        },
        type: 'info_response'
      });     
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
      
      return response.data;
    } catch (error) {
      // استعادة الإعدادات في حالة الخطأ
      this.loggerService.createLogger({
        message: `📅 خطأ في إنشاع موعد نقل عابر باستخدام البروكسي ${error}`,
        data: {
          error: JSON.stringify(error)
        },
        type: 'error'
      });
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
      throw error;
    }

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

