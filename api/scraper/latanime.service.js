const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_DOMAIN = 'latanime.org';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

/**
 * Searches for anime on Latanime.
 * @param {string} query 
 * @returns {Promise<{success: boolean, data: {results: Array<{title: string, slug: string, url: string, type: string}>}}>}
 */
async function searchAnime(query) {
  try {
    const searchUrl = `https://${DEFAULT_DOMAIN}/buscar?q=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, {
      headers: HTTP_HEADERS,
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    const seenSlugs = new Set();
    
    $('a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let rawTitle = $(el).find('h3, h2, .title').text().trim() || $(el).attr('title') || $(el).text().trim() || '';
      
      // Clean up title (remove " Latino" or " Castellano" suffix if any)
      let title = rawTitle.replace(/\s+(Latino|Castellano)$/i, '').trim();
      
      if (href) {
        const parts = href.split('/anime/');
        if (parts.length > 1) {
          const slug = parts[1].replace(/\/$/, '');
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
      }
    });
    
    return { success: true, data: { results } };
  } catch (err) {
    console.error(`[Latanime] [Search] Error:`, err.message);
    return { success: false, data: { results: [] } };
  }
}

/**
 * Extracts options from a Latanime episode page and decodes Base64 data-player attributes.
 * @param {string} episodeUrl 
 * @returns {Promise<{success: boolean, data: {streamLinks: {SUB: Array<{server: string, url: string}>, DUB: Array<{server: string, url: string}>}}}>}
 */
async function getEpisodeLinks(episodeUrl) {
  try {
    const res = await axios.get(episodeUrl, {
      headers: HTTP_HEADERS,
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    const subLinks = [];
    const dubLinks = [];
    
    // Check if the page belongs to Castellano or Latino (default is DUB)
    let isDub = true;
    const bodyText = $('body').text().toLowerCase();
    
    // Classify servers from a.play-video repro-item tags
    $('a.play-video').each((_, el) => {
      const dataPlayer = $(el).attr('data-player');
      let serverName = $(el).text().trim().toUpperCase();
      
      if (dataPlayer) {
        try {
          const decodedUrl = Buffer.from(dataPlayer, 'base64').toString('utf8');
          
          if (decodedUrl && decodedUrl.startsWith('http')) {
            if (isDub) {
              dubLinks.push({
                server: serverName,
                url: decodedUrl
              });
            } else {
              subLinks.push({
                server: serverName,
                url: decodedUrl
              });
            }
          }
        } catch (e) {
          console.warn(`[Latanime] [Links] Failed decoding player base64 token:`, e.message);
        }
      }
    });
    
    return {
      success: true,
      data: {
        streamLinks: { SUB: subLinks, DUB: dubLinks }
      }
    };
  } catch (err) {
    console.error(`[Latanime] [Links] Error getting links for ${episodeUrl}:`, err.message);
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
