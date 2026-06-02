const app = require('../api/index');
const http = require('http');
const axios = require('axios');

async function testLive() {
  console.log('Booting local miColita Anime server for testing...');
  const server = http.createServer(app);
  
  await new Promise((resolve) => server.listen(7099, resolve));
  console.log('Test server listening on port 7099.');

  try {
    // Test Zilla HLS Direct Play resolving and HLS proxying
    console.log('\n--- Testing Zilla HLS Playback Fix ---');
    const embedUrl = 'https://player.zilla-networks.com/play/c7b87de6d40c15bf4838b88efa430042';
    const playDirectUrl = `http://localhost:7099/play/direct?url=${encodeURIComponent(embedUrl)}&id=test_zilla`;
    
    console.log(`1. Requesting direct play for Zilla embed: ${playDirectUrl}`);
    const redirectRes = await axios.get(playDirectUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 300 && status < 400
    });
    
    const proxiedM3u8Url = redirectRes.headers.location;
    console.log(`   Redirected to proxy URL: ${proxiedM3u8Url}`);
    
    if (proxiedM3u8Url.includes('/play/proxy/')) {
      console.log('   SUCCESS: Zilla HLS redirected to universal proxy!');
    } else {
      console.log('   FAILURE: Did not redirect to proxy.');
    }

    // Fetch the proxied m3u8 playlist to check rewriting
    console.log(`\n2. Fetching the proxied HLS playlist to verify URL rewriting...`);
    const playlistRes = await axios.get(proxiedM3u8Url);
    console.log(`   Response Status: ${playlistRes.status}`);
    console.log(`   Content-Type: ${playlistRes.headers['content-type']}`);
    console.log(`   Playlist snippet (first 400 chars):\n`, playlistRes.data.substring(0, 400));

    // Verify absolute URL was rewritten to proxy
    if (playlistRes.data.includes('http://localhost:7099/play/proxy/')) {
      console.log('   SUCCESS: Zilla HLS absolute URLs successfully rewritten to proxy!');
    } else {
      console.log('   FAILURE: Absolute URLs inside playlist were not rewritten.');
    }

    // Extract one rewritten segment URL
    const lines = playlistRes.data.split('\n');
    const segmentLine = lines.find(line => line.includes('/play/proxy/') && line.includes('init.html'));
    
    if (segmentLine) {
      // Extract URL from URI="..." quotes
      const match = segmentLine.match(/URI=["']([^"']+)["']/);
      const segmentUrl = match ? match[1] : null;
      
      if (segmentUrl) {
        console.log(`\n3. Fetching proxied segment to verify MIME type override: ${segmentUrl}`);
        const segRes = await axios.get(segmentUrl, { timeout: 10000 });
        console.log(`   Response Status: ${segRes.status}`);
        console.log(`   Original Content-Type from Zilla: text/html`);
        console.log(`   Proxied Content-Type (MIME type): ${segRes.headers['content-type']}`);
        console.log(`   Content Length: ${segRes.data.length} bytes`);
        
        if (segRes.headers['content-type'] === 'video/mp4') {
          console.log('   SUCCESS: Zilla fMP4 segment Content-Type successfully overridden to video/mp4!');
        } else {
          console.log('   FAILURE: Content-Type was not overridden.');
        }
      } else {
        console.log('   WARNING: Could not parse URL from URI tag.');
      }
    } else {
      console.log('   WARNING: Could not find rewritten segment URL in playlist.');
    }

  } catch (e) {
    console.error('Error during test:', e.message);
  } finally {
    console.log('\nShutting down test server...');
    server.close();
  }
}

testLive();
