const axios = require('axios');

async function testZilla() {
  const url = 'https://player.zilla-networks.com/m3u8/c7b87de6d40c15bf4838b88efa430042';
  console.log('Testing URL:', url);
  
  const scenarios = [
    { name: 'No Headers', headers: {} },
    { name: 'With Referer', headers: { 'Referer': 'https://animeav1.com/' } },
    { name: 'With User-Agent', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } }
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
      console.log(`Data (first 200 chars):\n`, typeof res.data === 'string' ? res.data.substring(0, 200) : 'Not string');
    } catch (e) {
      console.log(`Error: ${e.message}`);
      if (e.response) {
        console.log(`Response Status: ${e.response.status}`);
        console.log(`Response Headers:`, e.response.headers);
      }
    }
  }
}

testZilla();
