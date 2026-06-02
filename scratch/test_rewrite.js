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
    return directUrl;
  }
}

function resolveUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    return url;
  }
}

function rewritePlaylist(playlistText, baseDirUrl, host, protocol) {
  const lines = playlistText.split('\n');
  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      // Look for URI="..." tags (like EXT-X-MAP or EXT-X-KEY)
      return line.replace(/URI=["']([^"']+)["']/g, (match, url) => {
        const absoluteUrl = resolveUrl(url, baseDirUrl);
        const proxied = getProxyUrl(absoluteUrl, host, protocol);
        return `URI="${proxied}"`;
      });
    } else {
      // It is a segment or sub-playlist URL line
      const absoluteUrl = resolveUrl(trimmed, baseDirUrl);
      const proxied = getProxyUrl(absoluteUrl, host, protocol);
      return proxied;
    }
  });
  return rewrittenLines.join('\n');
}

const mockPlaylist = `
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:17
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="https://player.zilla-networks.com/segs/c7b87de6d40c15bf4838b88efa430042/init.html"
#EXTINF:6.666667,
https://player.zilla-networks.com/segs/c7b87de6d40c15bf4838b88efa430042/seg-1.html
#EXTINF:6.666667,
relative-seg-2.html
`;

const baseDirUrl = 'https://player.zilla-networks.com/m3u8/';
const host = 'localhost:7099';
const protocol = 'http';

const rewritten = rewritePlaylist(mockPlaylist, baseDirUrl, host, protocol);
console.log('--- Rewritten Playlist ---');
console.log(rewritten);
