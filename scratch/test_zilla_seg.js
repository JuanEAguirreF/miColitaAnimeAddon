const axios = require('axios');

async function testZillaSegText() {
  const url = 'https://player.zilla-networks.com/segs/c7b87de6d40c15bf4838b88efa430042/init.html';
  console.log('Testing Segment URL:', url);
  
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://player.zilla-networks.com/'
      },
      timeout: 5000
    });
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers['content-type']}`);
    console.log(`Length: ${res.data.length} chars`);
    console.log(`First 1000 chars of data:\n`, res.data.substring(0, 1000));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

testZillaSegText();
