const axios = require('axios');

async function testFetch() {
  const url = 'https://ugc-cdn-caching-n3nwk7o8z9vtcwgtrk.cloudwindow-route.com/engine/hls2-c/01/17333/ykizhlwsqzs8_,n,.urlset/master.m3u8';
  console.log('Testing URL:', url);
  
  const scenarios = [
    { name: 'No Headers', headers: {} },
    { name: 'Referer Only', headers: { 'Referer': 'https://voe.sx/' } },
    { name: 'User-Agent Only', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } },
    { name: 'Both Referer and User-Agent', headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://voe.sx/'
    } }
  ];

  for (const s of scenarios) {
    try {
      console.log(`\n--- Scenario: ${s.name} ---`);
      const res = await axios.get(url, {
        headers: s.headers,
        timeout: 5000
      });
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${res.headers['content-type']}`);
      console.log(`Data (first 150 chars):`, typeof res.data === 'string' ? res.data.substring(0, 150) : 'Not string');
    } catch (e) {
      console.log(`Error: ${e.message}`);
      if (e.response) {
        console.log(`Response Status: ${e.response.status}`);
        console.log(`Response Headers:`, e.response.headers);
      }
    }
  }
}

testFetch();
