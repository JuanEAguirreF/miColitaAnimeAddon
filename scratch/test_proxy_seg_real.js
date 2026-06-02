const app = require('../api/index');
const http = require('http');
const axios = require('axios');

async function testProxySegReal() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(7099, resolve));

  try {
    // We will test proxying a Zilla segment (000.html)
    // Base64Url encoded dir: aHR0cHM6Ly9wbGF5ZXIuemlsbGEtbmV0d29ya3MuY29tL3NlZ3MvOTBhNzRjZDk2NmFlNTU2NjBhYTViN2FhMjRmZWUxNmEv (https://player.zilla-networks.com/segs/90a74cd966ae55660aa5b7aa24fee16a/)
    const encodedDir = 'aHR0cHM6Ly9wbGF5ZXIuemlsbGEtbmV0d29ya3MuY29tL3NlZ3MvOTBhNzRjZDk2NmFlNTU2NjBhYTViN2FhMjRmZWUxNmEv';
    const filename = '000.html';
    const proxyUrl = `http://localhost:7099/play/proxy/${encodedDir}/${filename}`;

    console.log('Fetching from local proxy:', proxyUrl);
    const res = await axios.get(proxyUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    console.log('Proxy Response Status:', res.status);
    console.log('Proxy Response Headers:', res.headers);
    console.log('Data Length:', res.data.byteLength, 'bytes');

    if (res.data.byteLength > 1000) {
      console.log('SUCCESS: Segment downloaded successfully through the proxy!');
    } else {
      console.log('FAILURE: Segment is empty or too small!');
    }
  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) {
      console.error('Response Status:', e.response.status);
      console.error('Response Headers:', e.response.headers);
    }
  } finally {
    server.close();
  }
}

testProxySegReal();
