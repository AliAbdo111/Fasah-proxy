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

    // When true, outbound calls use `platformProxies` (env only; user proxyEnabled / user.proxies are ignored).
    this.platformProxyEnabled = String(process.env.FASAH_USE_PROXY || 'false').toLowerCase() === 'true';

    // For better TLS support, use HTTPS proxy protocol (protocol: 'https')
    // and set rejectUnauthorized: true if the provider uses trusted certificates
    this.platformProxies = [
      {
        host: '31.59.20.176',
        port: 6754,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '198.23.239.134',
        port: 6540,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '31.56.127.193',
        port: 7684,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '45.38.107.97',
        port: 6014,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '107.172.163.27',
        port: 6543,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '216.10.27.159',
        port: 6837,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '142.111.67.146',
        port: 5611,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '191.96.254.138',
        port: 6185,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '31.58.9.4',
        port: 6077,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '23.229.19.94',
        port: 8689,
        username: 'epqiqeii',
        password: 'httc0aob5x24',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '45.58.244.222',
        port: 6635,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '46.203.30.53',
        port: 6054,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '104.252.75.116',
        port: 5486,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '9.142.207.108',
        port: 6274,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '150.241.110.25',
        port: 7029,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '9.142.35.240',
        port: 6411,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '192.46.189.181',
        port: 6174,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '130.180.233.102',
        port: 7673,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '63.246.130.95',
        port: 6296,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '63.141.62.182',
        port: 6475,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '9.142.41.180',
        port: 6350,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '45.56.180.36',
        port: 8270,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '45.56.179.126',
        port: 9330,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '46.202.34.191',
        port: 7957,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '46.203.86.161',
        port: 5661,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '72.1.181.168',
        port: 5562,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '136.143.246.97',
        port: 6746,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '46.202.34.144',
        port: 7910,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '63.246.130.246',
        port: 6447,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
      {
        host: '82.23.88.206',
        port: 7962,
        username: 'xpphhyal',
        password: 'e2m0f0vlmxmr',
        protocol: 'http',
        rejectUnauthorized: false,
      },
    ];

    // Optional per-user proxy pools (hardcoded). If a request has `proxyContext._id` that matches,
    // that user's pool is used; otherwise we fall back to `platformProxies`.
    this.userProxyPoolsById = new Map([
      [
        '69ff276e7dfba253f5f9b123',
        [
          { host: '168.222.97.4', port: 54482, username: 'i3xbed8ht4yz', password: 'qroht7l5ie93', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.5', port: 53006, username: 'lns05z1xjhto', password: '0wkmi95sf7jx', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.6', port: 54130, username: 'nouzqe7sim5k', password: '6wtmzog5yl34', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.228', port: 54039, username: '8lq30mpd7knj', password: 'ifkcyl82gtab', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.229', port: 56152, username: 'c5ptnrishfx6', password: '35oes1laxfk0', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.230', port: 51540, username: '3chxezmkiob8', password: '4wgzy3jeir8t', protocol: 'http', rejectUnauthorized: false },
          { host: '1.1.1.1', port: 56624, username: 'k97b2d4wzg15', password: '1an72zohkupl', protocol: 'http', rejectUnauthorized: false },
          { host: '1.1.1.1', port: 51116, username: 'q3ep8cdwijnh', password: 'm3phu4rgwje9', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.226', port: 52678, username: 'b9zkf518tuap', password: 'jq86ce0z71ft', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.227', port: 55065, username: 'ciy651qjomxf', password: '6i9nb5tcryx3', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69ff27337dfba253f5f9b055',
        [
          { host: '168.222.97.4', port: 54482, username: 'i3xbed8ht4yz', password: 'qroht7l5ie93', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.5', port: 53006, username: 'lns05z1xjhto', password: '0wkmi95sf7jx', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.6', port: 54130, username: 'nouzqe7sim5k', password: '6wtmzog5yl34', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.228', port: 54039, username: '8lq30mpd7knj', password: 'ifkcyl82gtab', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.229', port: 56152, username: 'c5ptnrishfx6', password: '35oes1laxfk0', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.230', port: 51540, username: '3chxezmkiob8', password: '4wgzy3jeir8t', protocol: 'http', rejectUnauthorized: false },
          { host: '1.1.1.1', port: 56624, username: 'k97b2d4wzg15', password: '1an72zohkupl', protocol: 'http', rejectUnauthorized: false },
          { host: '1.1.1.1', port: 51116, username: 'q3ep8cdwijnh', password: 'm3phu4rgwje9', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.226', port: 52678, username: 'b9zkf518tuap', password: 'jq86ce0z71ft', protocol: 'http', rejectUnauthorized: false },
          { host: '168.222.97.227', port: 55065, username: 'ciy651qjomxf', password: '6i9nb5tcryx3', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69ff26397dfba253f5f9aeab',
        [
          { host: 'brd.superproxy.io', port: 33335, username: 'brd-customer-hl_628e164c-zone-datacenter_proxy3', password: 'z8c50lsa45qi', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69fe7cf87dfba253f5f86857',
        [
          { host: 'brd.superproxy.io', port: 33335, username: 'brd-customer-hl_628e164c-zone-datacenter_proxy2', password: 'sui4jhswih79', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69e22333a6fa39fab690a6ac',
        [
          { host: 'brd.superproxy.io', port: 33335, username: 'brd-customer-hl_628e164c-zone-datacenter_proxy4', password: '219c1c1c8w2v', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69df93914f4917525fae4240',
        [
          { host: 'brd.superproxy.io', port: 33335, username: 'brd-customer-hl_628e164c-zone-datacenter_proxy1', password: 'd87611cn3tqj', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69ccabf09b01db681ba0da2c',
        [
          { host: '217.20.124.2', port: 80, username: 'ucqikpgn-SA-11', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '195.66.210.2', port: 80, username: 'ucqikpgn-SA-12', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '78.108.186.83', port: 80, username: 'ucqikpgn-SA-13', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '185.24.11.34', port: 80, username: 'ucqikpgn-SA-14', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '23.109.106.84', port: 80, username: 'ucqikpgn-SA-15', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '138.199.36.51', port: 80, username: 'ucqikpgn-SA-16', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '169.150.215.18', port: 80, username: 'ucqikpgn-SA-17', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '46.165.199.11', port: 80, username: 'ucqikpgn-SA-18', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '217.20.124.2', port: 80, username: 'ucqikpgn-SA-19', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '195.66.210.2', port: 80, username: 'ucqikpgn-SA-20', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69cca98c9b01db681ba0da22',
        [
          { host: '78.108.186.83', port: 80, username: 'ucqikpgn-SA-21', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '185.24.11.34', port: 80, username: 'ucqikpgn-SA-22', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '23.109.106.84', port: 80, username: 'ucqikpgn-SA-23', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '138.199.36.51', port: 80, username: 'ucqikpgn-SA-24', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '169.150.215.18', port: 80, username: 'ucqikpgn-SA-25', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '46.165.199.11', port: 80, username: 'ucqikpgn-SA-26', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '217.20.124.2', port: 80, username: 'ucqikpgn-SA-27', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '195.66.210.2', port: 80, username: 'ucqikpgn-SA-28', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '78.108.186.83', port: 80, username: 'ucqikpgn-SA-29', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
          { host: '185.24.11.34', port: 80, username: 'ucqikpgn-SA-30', password: 'seoerggxfamv', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69cca8319b01db681ba0da06',
        [
          { host: '31.59.20.176', port: 6754, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '198.23.239.134', port: 6540, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '31.56.127.193', port: 7684, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '45.38.107.97', port: 6014, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '107.172.163.27', port: 6543, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '216.10.27.159', port: 6837, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '142.111.67.146', port: 5611, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '191.96.254.138', port: 6185, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '31.58.9.4', port: 6077, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '23.229.19.94', port: 8689, username: 'epqiqeii', password: 'httc0aob5x24', protocol: 'http', rejectUnauthorized: false },
          { host: '45.58.244.222', port: 6635, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '46.203.30.53', port: 6054, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '104.252.75.116', port: 5486, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.207.108', port: 6274, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '150.241.110.25', port: 7029, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.35.240', port: 6411, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '192.46.189.181', port: 6174, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '130.180.233.102', port: 7673, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '63.246.130.95', port: 6296, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '63.141.62.182', port: 6475, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.41.180', port: 6350, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '45.56.180.36', port: 8270, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '45.56.179.126', port: 9330, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '46.202.34.191', port: 7957, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '46.203.86.161', port: 5661, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '72.1.181.168', port: 5562, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '136.143.246.97', port: 6746, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '46.202.34.144', port: 7910, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '63.246.130.246', port: 6447, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '82.23.88.206', port: 7962, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
      [
        '69fe7c138728d6c0288c2cc1',
        [
          { host: '45.39.157.227', port: 9259, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.210.52', port: 5717, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '46.203.30.252', port: 6253, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '104.252.59.213', port: 7685, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '45.248.55.158', port: 6744, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '82.23.89.137', port: 7894, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '207.228.29.35', port: 5526, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.14.84', port: 6740, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '192.46.190.179', port: 6772, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.10.16', port: 5672, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '63.246.137.39', port: 5668, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '82.22.96.171', port: 7879, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '72.1.154.245', port: 8136, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.36.157', port: 5828, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '192.53.66.198', port: 6304, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '5.59.251.212', port: 6251, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '96.62.194.237', port: 6439, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '138.226.65.222', port: 7413, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '192.53.137.99', port: 6387, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '150.241.110.176', port: 7180, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.11.91', port: 5247, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '9.142.215.239', port: 6404, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '45.58.244.176', port: 6589, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '216.98.254.137', port: 6447, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '82.24.35.109', port: 7832, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '45.56.161.29', port: 8905, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '104.252.62.89', port: 5460, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '104.252.75.133', port: 5503, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '166.0.41.52', port: 6560, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
          { host: '82.21.51.40', port: 7803, username: 'xpphhyal', password: 'e2m0f0vlmxmr', protocol: 'http', rejectUnauthorized: false },
        ],
      ],
    ]);
    
    // Rotation index for the shared platform proxy pool.
    this.proxyRotationMap = new Map();
  }

  /**
   * Next entry from hardcoded pools.
   * - If `proxyContext._id` matches `userProxyPoolsById`, uses that pool (rotates per user id).
   * - Otherwise uses `platformProxies` (rotates on key `__platform__`).
   */
  getNextPlatformProxy(proxyContext) {
    const userId = proxyContext && (proxyContext._id || proxyContext.id) ? String(proxyContext._id || proxyContext.id) : '';
    const userPool = userId ? this.userProxyPoolsById.get(userId) : null;
    const raw = Array.isArray(userPool) && userPool.length > 0 ? userPool : this.platformProxies;
    const proxies = raw.map((p) => this.normalizeProxyEntry(p)).filter(Boolean);
    if (proxies.length === 0) return null;
    const poolKey = Array.isArray(userPool) && userPool.length > 0 ? `user:${userId}` : '__platform__';
    return this.getNextProxy(poolKey, proxies);
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
        return response.data;
      } catch (error) {
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        this.loggerService.createLogger({ message: `Create transit appointment error: ${error}`, data: { error: String(error) }, type: 'error' });
        throw error;
      }
    }
    const response = await axios.post(url, requestData, postConfig);
    await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
    return response.data;

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
        return response.data;
      } catch (error) {
        if (originalReject !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
        else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        this.loggerService.createLogger({ message: `Create transit appointment error: ${error}`, data: { error: String(error) }, type: 'error' });
        throw error;
      }
    }
    const response = await axios.post(url, requestData, postConfig);
    await loggerService.createLogger({ message: 'Create transit appointment response', data: { response: response.data }, type: 'info_response' });
    return response.data;

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
        return response.data;
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
    return response.data;
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

