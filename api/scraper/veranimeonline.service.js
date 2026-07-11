const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_DOMAIN = 'veranimeonline.co';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

/**
 * Searches for anime on VerAnimeOnline.
 * @param {string} query 
 * @returns {Promise<{success: boolean, data: {results: Array<{title: string, slug: string, url: string, type: string}>}}>}
 */
async function searchAnime(query) {
  try {
    const searchUrl = `https://${DEFAULT_DOMAIN}/?s=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, {
      headers: HTTP_HEADERS,
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    const results = [];
    const seenSlugs = new Set();
    
    // Select result items in Dooplay theme
    $('.result-item article, #archive-content article').each((_, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href');
      let title = $(el).find('.title a, h3 a').text().trim() || a.attr('title') || '';
      
      if (href && href.includes('/anime/')) {
        const slug = href.split('/anime/')[1].replace(/\/$/, '');
        if (!seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          results.push({
            title: title.replace(/\s+/g, ' ').trim(),
            slug,
            url: href,
            type: 'Series'
          });
        }
      }
    });
    
    return { success: true, data: { results } };
  } catch (err) {
    console.error(`[VerAnimeOnline] [Search] Error:`, err.message);
    return { success: false, data: { results: [] } };
  }
}

/**
 * Extracts iframe links for a VerAnimeOnline episode.
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
    
    // Find all play-box-iframe frames
    $('.play-box-iframe iframe, iframe.metaframe').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src) {
        let serverName = 'VERANIMEONLINE';
        if (src.includes('blogger.com')) {
          serverName = 'Blogger';
        } else if (src.includes('ok.ru')) {
          serverName = 'OKRU';
        } else if (src.includes('voe')) {
          serverName = 'VOE';
        } else if (src.includes('streamwish')) {
          serverName = 'Streamwish';
        }
        
        subLinks.push({
          server: serverName,
          url: src
        });
      }
    });
    
    return {
      success: true,
      data: {
        streamLinks: { SUB: subLinks, DUB: dubLinks }
      }
    };
  } catch (err) {
    console.error(`[VerAnimeOnline] [Links] Error getting links for ${episodeUrl}:`, err.message);
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
