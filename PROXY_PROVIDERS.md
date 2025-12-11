# TLS/SSL Supporting Proxy Providers

This document lists proxy providers that properly support TLS/SSL connections for HTTPS requests.

## Why TLS Support Matters

When making HTTPS requests through a proxy:
- **Without proper TLS support**: You get SSL certificate errors (`SELF_SIGNED_CERT_IN_CHAIN`)
- **With proper TLS support**: The proxy handles TLS handshakes correctly without certificate issues

## Recommended Proxy Providers

### 1. **Oxylabs** ⭐ Highly Recommended
- **TLS Support**: Excellent, proper certificate handling
- **Uptime**: 99.9%
- **Features**: 
  - Over 20 million residential IPs
  - Unlimited bandwidth
  - Proper TLS/SSL termination
- **Website**: https://oxylabs.io
- **Configuration Example**:
```javascript
{
  host: 'pr.oxylabs.io',
  port: 7777,
  username: 'your-username',
  password: 'your-password',
  protocol: 'http', // Oxylabs uses HTTP proxy protocol
  rejectUnauthorized: false // Still needed for some setups
}
```

### 2. **Thordata**
- **TLS Support**: Lightning-fast TLS termination
- **Features**:
  - Built-in session pinning
  - Advanced captcha solving
  - Rotating residential IP pool
- **Website**: https://thordata.com
- **Best for**: High concurrency without TLS fingerprint bans

### 3. **SOAX**
- **TLS Support**: Good TLS support
- **Features**:
  - Flexible proxy filtering
  - Personal customer success managers (enterprise)
  - IP whitelisting support
- **Website**: https://soax.com

### 4. **Decodo**
- **TLS Support**: Cost-efficient with TLS support
- **Features**:
  - Coverage in 160+ locations
  - Best average response time
  - High-quality IPs
- **Website**: https://decodo.com

### 5. **Bright Data** (Current Provider)
- **TLS Support**: Supports TLS but may require `rejectUnauthorized: false`
- **Features**:
  - Extensive network
  - Customizable settings
  - Unlimited IPs
- **Website**: https://brightdata.com
- **Note**: You're currently using this provider. The SSL error is likely due to certificate chain issues, not lack of TLS support.

## Configuration Tips

### For Providers with Trusted Certificates
If your proxy provider uses trusted SSL certificates:
```javascript
{
  protocol: 'https', // Use HTTPS proxy protocol
  rejectUnauthorized: true // Can verify certificates
}
```

### For Most Residential Proxies
Most residential proxies require:
```javascript
{
  protocol: 'http', // HTTP proxy protocol (CONNECT method)
  rejectUnauthorized: false // Accept self-signed certificates
}
```

## Testing Proxy TLS Support

To test if a proxy properly supports TLS:

1. **Check provider documentation** - Look for "TLS support" or "SSL proxy"
2. **Test with `rejectUnauthorized: false`** - If it works, the proxy supports TLS but uses self-signed certs
3. **Try HTTPS protocol** - Some providers support `https://` proxy URLs
4. **Contact support** - Ask about TLS/SSL certificate handling

## Current Configuration

Your current Bright Data configuration should work with `rejectUnauthorized: false`. The SSL error occurs because:
- The proxy intercepts TLS connections
- It may present its own certificate chain
- Node.js can't verify the certificate chain

This is **normal** for most residential proxies and doesn't mean they don't support TLS - it just means they use self-signed certificates for security/privacy reasons.

## Migration Guide

To switch to a different provider:

1. Sign up with the new provider
2. Get your proxy credentials
3. Update the `proxies` array in `services/fasahClient.js`
4. Test with a single proxy first
5. Add more proxies for rotation

Example for Oxylabs:
```javascript
{
  host: 'pr.oxylabs.io',
  port: 7777,
  username: 'customer-USERNAME',
  password: 'PASSWORD',
  protocol: 'http',
  rejectUnauthorized: false
}
```

