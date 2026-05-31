const { URL } = require('url');

function getProxyUrl(directUrl, host, protocol) {
  try {
    const parsed = new URL(directUrl);
    const lastSlash = parsed.pathname.lastIndexOf('/');
    const dirPath = parsed.pathname.substring(0, lastSlash + 1);
    const filename = parsed.pathname.substring(lastSlash + 1);
    
    const baseDirUrl = `${parsed.origin}${dirPath}`;
    const encodedDir = Buffer.from(baseDirUrl).toString('base64url');
    
    const query = parsed.search;
    return `${protocol}://${host}/play/proxy/${encodedDir}/${filename}${query}`;
  } catch (e) {
    console.error('Error:', e.message);
    return directUrl;
  }
}

function decodeProxyRequest(encodedDir, filename, queryParams) {
  try {
    const baseDirUrl = Buffer.from(encodedDir, 'base64url').toString('utf8');
    const queryString = new URLSearchParams(queryParams).toString();
    const fullUrl = `${baseDirUrl}${filename}${queryString ? '?' + queryString : ''}`;
    return fullUrl;
  } catch (e) {
    console.error('Decode error:', e.message);
    return null;
  }
}

const originalUrl = 'https://ugc-cdn-caching-n3tahswod7yjm8kezo.cloudwindow-route.com/engine/hls2-c/01/17333/ykizhlwsqzs8_,n,.urlset/master.m3u8?t=nqHBOEnnfA9TxXgoYz29DAcBjkkJ2Z8GJuRUplNIWFI&s=1780227527';
const host = 'localhost:7001';
const protocol = 'http';

const proxied = getProxyUrl(originalUrl, host, protocol);
console.log('Proxied URL:', proxied);

// Simulate the incoming request
const parsedProxied = new URL(proxied);
const pathParts = parsedProxied.pathname.split('/').filter(Boolean);
const encodedDir = pathParts[2]; // /play/proxy/:encodedDir/:filename
const filename = pathParts.slice(3).join('/'); // supports wildcards
const queryParams = Object.fromEntries(parsedProxied.searchParams.entries());

console.log('\n--- Decoded ---');
console.log('Encoded Dir:', encodedDir);
console.log('Filename:', filename);
console.log('Query Params:', queryParams);

const decoded = decodeProxyRequest(encodedDir, filename, queryParams);
console.log('Decoded URL:', decoded);

if (decoded === originalUrl) {
  console.log('\nSUCCESS: Proxy encoding and decoding matches exactly!');
} else {
  console.log('\nFAILURE: URLs do not match.');
}
