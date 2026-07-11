const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_DOMAIN = 'tioplus.app';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

/**
 * Searches for anime on TioPlus using its AJAX API endpoint.
 * @param {string} query 
 * @returns {Promise<{success: boolean, data: {results: Array<{title: string, slug: string, url: string, type: string}>}}>}
 */
async function searchAnime(query) {
  try {
    const searchUrl = `https://${DEFAULT_DOMAIN}/api/search/${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, {
      headers: {
        ...HTTP_HEADERS,
        'Referer': `https://${DEFAULT_DOMAIN}/search`
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    const seenSlugs = new Set();
    
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      let rawTitle = $(el).find('h3').text().trim() || $(el).text().trim() || '';
      
      // Clean up title (remove "Anime " prefix, trailing year, etc.)
      let title = rawTitle.replace(/^Anime\s+/i, '').replace(/\s*\(\d{4}\)$/, '').trim();
      
      if (href && (href.includes('/anime/') || href.includes('/serie/') || href.includes('/dorama/'))) {
        // Extract slug
        const parts = href.split('/');
        const slug = parts[parts.length - 1] || parts[parts.length - 2];
        if (slug && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          results.push({
            title,
            slug,
            url: href.startsWith('http') ? href : `https://${DEFAULT_DOMAIN}${href}`,
            type: 'Series'
          });
        }
      }
    });
    
    return { success: true, data: { results } };
  } catch (err) {
    console.error(`[TioPlus] [Search] Error:`, err.message);
    return { success: false, data: { results: [] } };
  }
}

/**
 * Extracts options from a TioPlus episode, resolves player redirection URLs in real-time.
 * @param {string} episodeUrl 
 * @returns {Promise<{success: boolean, data: {streamLinks: {SUB: Array<{server: string, url: string}>, DUB: Array<{server: string, url: string}>}}}>}
 */
async function getEpisodeLinks(episodeUrl) {
  try {
    const res = await axios.get(episodeUrl, {
      headers: {
        ...HTTP_HEADERS,
        'Referer': `https://${DEFAULT_DOMAIN}/`
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    const subLinks = [];
    const dubLinks = [];
    
    // Find all player option buttons in lists
    const options = [];
    $('.subselect li').each((_, el) => {
      const token = $(el).attr('data-server');
      let text = $(el).text().trim().replace(/\s+/g, ' ');
      // Detect language from container tab or text
      let isDub = false;
      const parentTab = $(el).closest('.tabs');
      if (parentTab.length > 0) {
        const tabHeader = parentTab.find('.active.button').text().trim().toLowerCase();
        if (tabHeader.includes('latino') || tabHeader.includes('castellano')) {
          isDub = true;
        }
      }
      if (text.toLowerCase().includes('latino') || text.toLowerCase().includes('castellano') || text.toLowerCase().includes('español')) {
        isDub = true;
      }
      
      if (token) {
        options.push({ token, text, isDub });
      }
    });
    
    // For each option, construct its double-base64 player iframe endpoint
    for (const opt of options) {
      // client double-b64 equivalent: btoa(token)
      const doubleB64 = Buffer.from(opt.token).toString('base64');
      const playerUrl = `https://${DEFAULT_DOMAIN}/player/${doubleB64}`;
      
      let serverName = opt.text.split(' - ')[0] || 'TioPlus';
      
      if (opt.isDub) {
        dubLinks.push({
          server: serverName.toUpperCase(),
          url: playerUrl
        });
      } else {
        subLinks.push({
          server: serverName.toUpperCase(),
          url: playerUrl
        });
      }
    }
    
    return {
      success: true,
      data: {
        streamLinks: { SUB: subLinks, DUB: dubLinks }
      }
    };
  } catch (err) {
    console.error(`[TioPlus] [Links] Error getting links for ${episodeUrl}:`, err.message);
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
