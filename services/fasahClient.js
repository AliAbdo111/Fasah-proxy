const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

class FasahClient {
  constructor() {
    // Support both broker and transporter endpoints
    this.brokerBaseUrl = process.env.FASAH_BROKER_BASE_URL || 'https://fasah.zatca.gov.sa';
    this.transporterBaseUrl = process.env.FASAH_TRANSPORTER_BASE_URL || 'https://oga.fasah.sa';
    this.apiPath = '/api/zatca-tas/v2';
    
    // Proxy rotation configuration
    this.proxies = [
      {
        host: 'brd.superproxy.io',
        port: 33335,
        username: 'brd-customer-hl_0d104c73-zone-residential_proxy1',
        password: 'nqktf6dz7d9s'
      },
      {
        host: 'brd.superproxy.io',
        port: 33335,
        username: 'brd-customer-hl_0d104c73-zone-residential_proxy2',
        password: '4npqu118r65l'
      },
      {
        host: 'brd.superproxy.io',
        port: 33335,
        username: 'brd-customer-hl_0d104c73-zone-residential_proxy3',
        password: 'nkjx6vepy1us'
      },
      {
        host: 'brd.superproxy.io',
        port: 33335,
        username: 'brd-customer-hl_0d104c73-zone-residential_proxy4',
        password: 'svye5y2cv0u0'
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
   * @returns {HttpsProxyAgent} Proxy agent
   */
  createProxyAgent(proxyConfig) {
    const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
    return new HttpsProxyAgent(proxyUrl);
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

      // Get next proxy in rotation
      const proxy = this.getNextProxy();
      const httpsAgent = this.createProxyAgent(proxy);
      
      console.log(`🔄 Using proxy: ${proxy.username}@${proxy.host}:${proxy.port}`);

      const response = await axios.get(url, {
        params: queryParams,
        headers,
        httpsAgent,
        timeout: 30000 // 30 seconds timeout
      });

      return response.data;
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
        message = 'Too many requests - Rate limit exceeded';
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
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}

module.exports = FasahClient;

