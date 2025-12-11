const FasahClient = require('./services/fasahClient');

const client = new FasahClient();

const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ5bGR3YjAwMSIsIkdST1VQUyAiOiJBQSxHQSxST0xMT1VUVVNFUixUQVNBQ0NUQURNLFRBU0dFTixXQklCR1UsV0JJQlNHVSxXQklCVEdVLEJyb2tlciIsIkdST1VQUyI6IkFBLEdBLFJPTExPVVRVU0VSLFRBU0FDQ1RBRE0sVEFTR0VOLFdCSUJHVSxXQklCU0dVLFdCSUJUR1UsQnJva2VyIiwiSVNfU1NPICI6ZmFsc2UsIlNTT19UT0tFTiAiOiIiLCJJU19TU08iOmZhbHNlLCJTU09fVE9LRU4iOiIiLCJDTElFTlRfTkFNRSI6IkZBU0FIIiwiaXNzIjoiRkFTQUgiLCJhdWQiOiJGQVNBSCBBcHBsaWNhdGlvbiIsImV4cCI6MTc2NTM5Mzk2MX0.1J-txhF7V8EyROZvW31E2kqEs1Zb2hC4pxCU-n1R-0HkrHg0fHgh5gU1JAlSzWcbEV7kL9mDxHFHonyA7eusnA';

async function testProxy() {
  console.log('🧪 Testing Proxy Rotation...\n');
  
  const params = {
    departure: 'AGF',
    arrival: '31',
    type: 'TRANSIT',
    token: token,
    userType: 'broker'
  };

  try {
    console.log('📡 Request 1: Using first proxy...');
    const result1 = await client.getLandSchedule(params);
    console.log('✅ Request 1 completed');
    console.log('Response:', JSON.stringify(result1, null, 2).substring(0, 200) + '...\n');

    // Wait a bit before next request
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📡 Request 2: Using second proxy...');
    const result2 = await client.getLandSchedule(params);
    console.log('✅ Request 2 completed');
    console.log('Response:', JSON.stringify(result2, null, 2).substring(0, 200) + '...\n');

    console.log('✅ Proxy rotation test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.data) {
      console.error('Error details:', JSON.stringify(error.data, null, 2));
    }
  }
}

testProxy();

