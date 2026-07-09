const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_DOMAIN = 'ww3.gnulahd.nu';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/**
 * Searches for series/movies on GnulaHD.
 * @param {string} query 
 * @returns {Promise<{success: boolean, data: {results: Array<{title: string, slug: string, url: string, image: string, type: string}>}}>}
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

    $('.gnrd-grid a').each((_, el) => {
      const href = $(el).attr('href');
      let text = $(el).text().trim();
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || $(el).find('img').attr('data-lazy-src');

      if (href && href.includes('/ver/') && !href.includes('/ver/series') && !href.includes('/ver/peliculas') && !href.includes('/ver/anime')) {
        const slug = href.split('/ver/')[1].replace(/\/$/, '');
        
        if (!seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          
          // Clean rating stars/texts from anchor text
          text = text.replace(/★\s*\d+\.\d+/, '')
                     .replace(/LATSUBCAST|LATSUB|LAT|CAST|SUB/g, '')
                     .replace(/\s+/g, ' ')
                     .trim();

          results.push({
            title: text,
            slug,
            url: href,
            image: img,
            type: 'Series'
          });
        }
      }
    });

    return { success: true, data: { results } };
  } catch (err) {
    console.error(`[GnulaHD] [Search] Error searching for "${query}":`, err.message);
    return { success: false, data: { results: [] } };
  }
}

/**
 * Extracts video links for a GnulaHD episode.
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
    const match = html.match(/var\s+_gnpv_ep_langs\s*=\s*(\[[\s\S]*?\]);/i);
    
    const subLinks = [];
    const dubLinks = [];
    
    if (match) {
      const langs = JSON.parse(match[1]);
      
      langs.forEach(lang => {
        const isDub = lang.label === 'Latino' || lang.label === 'Castellano' || lang.flag === 'MX' || lang.flag === 'ES';
        const targetList = isDub ? dubLinks : subLinks;
        
        lang.servers.forEach(s => {
          let serverName = s.title;
          
          // Normalize server names
          if (s.src.includes('voe')) serverName = 'VOE';
          else if (s.src.includes('ok.ru')) serverName = 'OKRU';
          else if (s.src.includes('they.tube')) serverName = 'THEYTUBE';
          else if (s.src.includes('bysevepoin') || s.src.includes('streamwish') || s.src.includes('sfastwish')) serverName = 'STREAMWISH';
          else if (s.src.includes('vidsonic')) serverName = 'VIDSONIC';
          else if (s.src.includes('streamtape')) serverName = 'STREAMTAPE';
          
          targetList.push({
            server: `${serverName} (${lang.label.toUpperCase()})`,
            url: s.src
          });
        });
      });
    }
    
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
    console.error(`[GnulaHD] [Links] Error getting links for ${episodeUrl}:`, err.message);
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
