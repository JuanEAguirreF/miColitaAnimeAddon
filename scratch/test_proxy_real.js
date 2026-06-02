const app = require('../api/index');
const http = require('http');
const axios = require('axios');

async function testProxyReal() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(7099, resolve));

  try {
    // We will test proxying a Zilla segment
    // Base64Url encoded dir: aHR0cHM6Ly9wbGF5ZXIuemlsbGEtbmV0d29ya3MuY29tL3NlZ3MvYzdiODdkZTZkNDBjMTViZjQ4MzhiODhlZmE0MzAwNDIv (https://player.zilla-networks.com/segs/c7b87de6d40c15bf4838b88efa430042/)
    const encodedDir = 'aHR0cHM6Ly9wbGF5ZXIuemlsbGEtbmV0d29ya3MuY29tL3NlZ3MvYzdiODdkZTZkNDBjMTViZjQ4MzhiODhlZmE0MzAwNDIv';
    const filename = 'init.html';
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
      console.log('SUCCESS: Binary data downloaded successfully through the proxy!');
    } else {
      console.log('FAILURE: Binary data is empty or too small!');
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

testProxyReal();
