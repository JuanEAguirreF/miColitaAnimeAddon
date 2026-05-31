const app = require('../api/index');
const http = require('http');
const axios = require('axios');

async function testLive() {
  console.log('Booting local miColita Anime server for testing...');
  const server = http.createServer(app);
  
  await new Promise((resolve) => server.listen(7099, resolve));
  console.log('Test server listening on port 7099.');

  try {
    // 1. Test Manifest
    console.log('\nFetching manifest...');
    const manifestRes = await axios.get('http://localhost:7099/manifest.json');
    console.log('Manifest Name:', manifestRes.data.name);
    console.log('Manifest Types:', manifestRes.data.types);

    // 2. Test Stream List (Parallel Cascade & No Embeds)
    // Farming Life in Another World Episode 8
    console.log('\nFetching stream options for Farming Life in Another World E8...');
    console.log('Executing parallel cascade across all scrapers (this may take up to 6 seconds)...');
    
    const startTime = Date.now();
    const streamRes = await axios.get('http://localhost:7099/stream/series/tt19223420:2:8.json');
    const elapsed = Date.now() - startTime;
    
    console.log(`\n--- Query Completed in ${(elapsed / 1000).toFixed(2)}s ---`);
    const streams = streamRes.data.streams || [];
    console.log(`Found ${streams.length} total streams!`);
    
    const embeds = streams.filter(s => s.type === 'embed' || s.externalUrl);
    const urls = streams.filter(s => s.type === 'url' || s.url);
    
    console.log(`Native Streams: ${urls.length}`);
    console.log(`Embed (browser) Streams: ${embeds.length}`);
    
    if (embeds.length === 0) {
      console.log('SUCCESS: Browser embed links have been successfully removed!');
    } else {
      console.log('WARNING: Browser embed links are still present.');
    }

    if (streams.length > 0) {
      console.log('\nListing the first 5 stream options:');
      streams.slice(0, 5).forEach((s, idx) => {
        console.log(`\n${idx + 1}. Title: ${s.title.replace(/\n/g, ' | ')}`);
        console.log(`   URL: ${s.url}`);
      });
      
      // 3. Test Proxy Redirection for VOE/YourUpload
      const voeStream = streams.find(s => s.title.includes('VOE') || s.url.includes('VOE'));
      if (voeStream) {
        console.log(`\nTesting proxy redirect for resolved VOE stream...`);
        console.log(`Requesting: ${voeStream.url}`);
        
        // Fetch it and see where it redirects
        const redirectRes = await axios.get(voeStream.url, {
          maxRedirects: 0,
          validateStatus: (status) => status >= 300 && status < 400
        });
        
        const redirectLocation = redirectRes.headers.location;
        console.log('Redirect Location:', redirectLocation);
        
        if (redirectLocation.includes('/play/proxy/')) {
          console.log('SUCCESS: VOE stream correctly redirected through our universal proxy!');
        } else {
          console.log('FAILURE: VOE stream did not redirect to the proxy.');
        }
      }
    } else {
      console.log('No streams found. Maybe Kitsu API or providers are down?');
    }

  } catch (e) {
    console.error('Error during test:', e.message);
  } finally {
    console.log('\nShutting down test server...');
    server.close();
  }
}

testLive();
