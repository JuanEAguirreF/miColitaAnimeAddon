const axios = require('axios');
const cheerio = require('cheerio');
const { ApiError } = require('../utils/api-error');

const DEFAULT_DOMAIN = 'tokianime.tv';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/**
 * Searches for anime on TokiAnime using their JSON search API.
 * @param {string} query 
 * @returns {Promise<{success: boolean, data: {results: Array<{title: string, slug: string, url: string, image: string, type: string}>}}>}
 */
async function searchAnime(query) {
  try {
    const res = await axios.post(`https://${DEFAULT_DOMAIN}/api/search`, {
      q: query,
      adult: false,
      count: 8
    }, {
      headers: {
        ...HTTP_HEADERS,
        'Referer': `https://${DEFAULT_DOMAIN}/buscar`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    const results = (res.data.items || []).map(item => ({
      title: item.title,
      slug: item.slug,
      url: `https://${DEFAULT_DOMAIN}/anime/${item.slug}`,
      image: item.cover_image,
      type: 'Anime'
    }));

    return { success: true, data: { results } };
  } catch (err) {
    console.error(`[TokiAnime] [Search] Error searching for "${query}":`, err.message);
    return { success: false, data: { results: [] } };
  }
}

/**
 * Parses episode links from Next.js state or HTML.
 * @param {string} html 
 * @returns {Array<{site: string, server: string|null, lang: string, url: string, quality?: string, play: {src: string, kind: string}}>}
 */
function extractRankedServers(html) {
  // Regex that handles both escaped comillas (\") and normal comillas (") inside Next.js state
  const regex = /(?:\\"|")rankedServers(?:\\"|")\s*:\s*(\[[\s\S]*?\])/g;
  
  let match;
  const servers = [];
  
  while ((match = regex.exec(html)) !== null) {
    let rawArrayText = match[1];
    
    // Unescape common JSON characters if escaped
    if (rawArrayText.includes('\\"')) {
      rawArrayText = rawArrayText
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\u0026/g, '&');
    }
    
    try {
      // Find matching bracket end to handle next_f string splits
      let bracketCount = 0;
      let cleanText = '';
      for (let i = 0; i < rawArrayText.length; i++) {
        const char = rawArrayText[i];
        cleanText += char;
        if (char === '[') bracketCount++;
        if (char === ']') {
          bracketCount--;
          if (bracketCount === 0) break;
        }
      }
      
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        servers.push(...parsed);
      }
    } catch (e) {
      // Ignore parse issues on irrelevant matches
    }
  }
  
  // Return unique servers based on play.src
  const seen = new Set();
  return servers.filter(s => {
    if (!s.play || !s.play.src) return false;
    if (seen.has(s.play.src)) return false;
    seen.add(s.play.src);
    return true;
  });
}

/**
 * Extracts all stream links for a TokiAnime episode URL.
 * @param {string} episodeUrl 
 * @returns {Promise<{success: boolean, data: {streamLinks: {SUB: Array<{server: string, url: string}>, DUB: Array<{server: string, url: string}>}}}>}
 */
async function getEpisodeLinks(episodeUrl) {
  try {
    const res = await axios.get(episodeUrl, {
      headers: HTTP_HEADERS,
      timeout: 8000
    });
    
    const html = res.data;
    const rankedServers = extractRankedServers(html);
    
    const subLinks = [];
    const dubLinks = [];
    
    rankedServers.forEach(s => {
      const serverLabel = s.quality ? `TOKIHLS (${s.quality})` : 'TOKIHLS';
      const playUrl = s.play.src.startsWith('http') ? s.play.src : `https://${DEFAULT_DOMAIN}${s.play.src}`;
      
      const linkObj = {
        server: serverLabel,
        url: playUrl
      };
      
      if (s.lang === 'DUB') {
        dubLinks.push(linkObj);
      } else {
        subLinks.push(linkObj);
      }
    });
    
    return {
      success: true,
      data: {
        streamLinks: {
          SUB: subLinks,
          DUB: dubLinks
        }
      }
    };
  } catch (err) {
    console.error(`[TokiAnime] [Links] Error fetching episode links for ${episodeUrl}:`, err.message);
    return {
      success: false,
      data: {
        streamLinks: { SUB: [], DUB: [] }
      }
    };
  }
}

module.exports = {
  searchAnime,
  getEpisodeLinks
};
