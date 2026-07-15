const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const http = require('http');
const https = require('https');
const { PassThrough } = require('stream');

// Scraper services
const { resolveEmbedUrl } = require('./scraper/download.service');
const tioanimeService = require('./scraper/tioanime.service');
const animeflvService = require('./scraper/animeflv.service');
const animeav1Service = require('./scraper/animeav1.service');
const monoschinosService = require('./scraper/monoschinos.service');
const jkanimeService = require('./scraper/jkanime.service');
const tokianimeService = require('./scraper/tokianime.service');
const gnulahdService = require('./scraper/gnulahd.service');
const veranimeonlineService = require('./scraper/veranimeonline.service');
const tioplusService = require('./scraper/tioplus.service');
const latanimeService = require('./scraper/latanime.service');

// Persistent HTTP/HTTPS Keep-Alive Agents to boost chunk downloading speed
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
});
const keepAliveHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
});

const app = express();
app.use(cors());

// Addon Manifest Definition for miColita Anime
const MANIFEST = {
  id: 'org.micolita.anime.addon',
  version: '1.1.0',
  name: 'miColita Anime',
  description: 'Addon de Stremio premium para ver Anime en Español (SUB/DUB). Enlaces directos y streams rápidos de AnimeFLV, TioAnime, MonosChinos, AnimeAV1 y JKAnime.',
  logo: 'https://i.imgur.com/G55nEqA.png',
  background: 'https://i.imgur.com/3cPhFmg.jpeg',
  resources: ['stream'],
  types: ['movie', 'series', 'anime'],
  idPrefixes: ['tt', 'kitsu'],
  catalogs: []
};

// Memory Cache Systems
const metaCache = new Map();
const streamCache = new Map();
const directLinkCache = new Map();

const CACHE_TTL_META = 24 * 60 * 60 * 1000; // 24 hours for metadata
const CACHE_TTL_STREAMS = 3 * 60 * 60 * 1000; // 3 hours for stream lists
const CACHE_TTL_DIRECT = 3 * 60 * 60 * 1000; // 3 hours for resolved direct video URLs

// Helper to clean and normalize names for fuzzy matching
function cleanName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[-_]/g, " ") // replace hyphens and underscores with spaces
    .replace(/[^a-z0-9\s]/g, "") // remove other special chars
    .replace(/\s+/g, " ")
    .trim();
}

// Metadata resolver from Cinemeta or Kitsu Addon APIs
async function getAnimeMeta(id, type) {
  const cacheKey = `${id}:${type}`;
  const cached = metaCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_TTL_META)) {
    console.log(`[miColita Anime] [Cache] Metadata for ${id} loaded from cache.`);
    return cached.data;
  }

  try {
    if (id.startsWith('kitsu:')) {
      const cleanKitsuId = id.replace('kitsu:', '');
      const url = `https://anime-kitsu.strem.fun/meta/anime/kitsu:${cleanKitsuId}.json`;
      console.log(`[miColita Anime] [Meta] Fetching Kitsu metadata from: ${url}`);
      try {
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data && response.data.meta) {
          metaCache.set(cacheKey, { data: response.data.meta, timestamp: now });
          return response.data.meta;
        }
      } catch (err) {
        console.warn(`[miColita Anime] [Meta] Failed fetching from Kitsu community API: ${err.message}. Invoking official Kitsu API fallback...`);
        const officialUrl = `https://kitsu.io/api/edge/anime/${cleanKitsuId}`;
        const response = await axios.get(officialUrl, { timeout: 10000 });
        if (response.data && response.data.data && response.data.data.attributes) {
          const attr = response.data.data.attributes;
          const metaObj = {
            name: attr.canonicalTitle || attr.titles.en_jp || attr.titles.en,
            genres: attr.genres || []
          };
          console.log(`[miColita Anime] [Meta] Official Kitsu API Fallback resolved title: "${metaObj.name}"`);
          metaCache.set(cacheKey, { data: metaObj, timestamp: now });
          return metaObj;
        }
      }
    } else if (id.startsWith('tt')) {
      // IMDb ID
      const resolvedType = type === 'movie' ? 'movie' : 'series';
      const url = `https://v3-cinemeta.strem.io/meta/${resolvedType}/${id}.json`;
      console.log(`[miColita Anime] [Meta] Fetching Cinemeta metadata from: ${url}`);
      const response = await axios.get(url, { timeout: 10000 });
      if (response.data && response.data.meta) {
        metaCache.set(cacheKey, { data: response.data.meta, timestamp: now });
        return response.data.meta;
      }

      // Fallback: try opposite type if it was misclassified in request
      const alternativeType = resolvedType === 'series' ? 'movie' : 'series';
      const fallbackUrl = `https://v3-cinemeta.strem.io/meta/${alternativeType}/${id}.json`;
      console.log(`[miColita Anime] [Meta] Fetching Cinemeta fallback metadata from: ${fallbackUrl}`);
      const fallbackResponse = await axios.get(fallbackUrl, { timeout: 10000 });
      if (fallbackResponse.data && fallbackResponse.data.meta) {
        metaCache.set(cacheKey, { data: fallbackResponse.data.meta, timestamp: now });
        return fallbackResponse.data.meta;
      }
    }
  } catch (e) {
    console.error(`[miColita Anime] [Meta] Error resolving metadata for ${id}:`, e.message);
  }
  return null;
}

// Scraper matcher helper to find the exact slug
async function findSlugInProvider(service, animeName, providerName) {
  try {
    const searchResult = await service.searchAnime(animeName);
    if (searchResult && searchResult.success && searchResult.data.results.length > 0) {
      const results = searchResult.data.results;
      // Prioritize results containing "Latino" in their title, lang property, or slug
      results.sort((a, b) => {
        const aLat = (a.lang === 'LATINO') || (a.title || '').toUpperCase().includes('LATINO') || (a.slug || '').toLowerCase().includes('latino');
        const bLat = (b.lang === 'LATINO') || (b.title || '').toUpperCase().includes('LATINO') || (b.slug || '').toLowerCase().includes('latino');
        if (aLat && !bLat) return -1;
        if (!aLat && bLat) return 1;
        return 0;
      });
      const targetClean = cleanName(animeName);

      // Helper to check if both titles have the exact same season numbers
      const hasSameSeasonNumbers = (str1, str2) => {
        const getNumbers = (s) => {
          const matches = s.match(/\b(?:s|temporada|season)?\s*(\d+)\b/gi) || [];
          return matches.map(m => {
            const numMatch = m.match(/\d+/);
            return numMatch ? numMatch[0] : '';
          }).filter(n => n !== '');
        };
        const nums1 = getNumbers(str1);
        const nums2 = getNumbers(str2);
        if (nums1.length !== nums2.length) return false;
        return nums1.every(n => nums2.includes(n));
      };

      // 1. Check exact match
      for (const res of results) {
        if (cleanName(res.title) === targetClean) {
          return res.slug;
        }
      }

      // 2. Check fuzzy match (includes)
      for (const res of results) {
        const cleanResTitle = cleanName(res.title);
        if ((cleanResTitle.includes(targetClean) || targetClean.includes(cleanResTitle)) && (providerName === 'Latanime' || providerName === 'GnulaHD' || hasSameSeasonNumbers(targetClean, cleanResTitle))) {
          return res.slug;
        }
      }

      // 3. Check token overlap (shares at least 50% of significant non-stop words)
      const STOP_WORDS = new Set(['in', 'of', 'the', 'a', 'to', 'and', 'for', 'at', 'by', 'an', 'el', 'la', 'de', 'con', 'un', 'del', 'los', 'las', 'y', 'o', 'u', 'en', 'para', 'por', 'que']);
      const targetWords = targetClean.split(' ').filter(w => w && !STOP_WORDS.has(w));
      if (targetWords.length > 0) {
        for (const res of results) {
          const cleanResTitle = cleanName(res.title);
          const resWords = cleanResTitle.split(' ').filter(w => w && !STOP_WORDS.has(w));
          const overlapCount = targetWords.filter(w => resWords.includes(w)).length;
          const ratio = overlapCount / targetWords.length;
          if (ratio >= 0.5 && (providerName === 'Latanime' || providerName === 'GnulaHD' || hasSameSeasonNumbers(targetClean, cleanResTitle))) {
            return res.slug;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[miColita Anime] [Scraper] Error searching slug in ${providerName}:`, err.message);
  }
  return null;
}

// Resolve embed URL to direct video source URL
async function resolveToDirectLink(id, embedUrl) {
  const cached = directLinkCache.get(id);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_TTL_DIRECT)) {
    console.log(`[miColita Anime] [Cache] Direct video link for ${id} loaded from cache.`);
    return cached.url;
  }

  console.log(`[miColita Anime] [Direct] Resolving embed: ${embedUrl} in real-time...`);
  try {
    // Call the anime1v-api resolveEmbedUrl function
    const directUrl = await resolveEmbedUrl(embedUrl);
    if (directUrl) {
      console.log(`[miColita Anime] [Direct] Successfully resolved direct URL: ${directUrl.substring(0, 120)}...`);
      directLinkCache.set(id, { url: directUrl, timestamp: now });
      return directUrl;
    }
  } catch (err) {
    console.error(`[miColita Anime] [Direct] Error resolving embed to direct link:`, err.message);
  }
  return null;
}

const kitsuTitlesCache = new Map();

// Helper to fetch Romaji and alternative titles from Kitsu API
async function getAlternativeTitlesFromKitsu(name) {
  if (!name || typeof name !== 'string') return [];
  
  const cached = kitsuTitlesCache.get(name);
  if (cached) {
    return cached;
  }
  
  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(name)}`;
    console.log(`[miColita Anime] [Kitsu] Querying alternative titles for: "${name}"`);
    const response = await axios.get(url, { timeout: 5000 });
    
    const titles = [];
    if (response.data && response.data.data && response.data.data.length > 0) {
      const item = response.data.data[0];
      const attr = item.attributes || {};
      
      if (attr.canonicalTitle) titles.push(attr.canonicalTitle);
      if (attr.titles) {
        if (attr.titles.en_jp) titles.push(attr.titles.en_jp);
        if (attr.titles.en) titles.push(attr.titles.en);
      }
      
      const unique = [...new Set(titles)];
      kitsuTitlesCache.set(name, unique);
      return unique;
    }
  } catch (err) {
    console.error(`[miColita Anime] [Kitsu] Error fetching Kitsu titles:`, err.message);
  }
}

/**
 * Generates alternative titles representing different season formats in Spanish (S2, Temporada 2, etc.)
 * based on English patterns like '2nd Season', 'Season 3', 'S4'.
 * @param {string} animeName 
 * @returns {Array<string>}
 */
function generateSeasonAliases(animeName) {
  const aliases = [];
  const name = animeName.trim();
  
  const seasonRegexes = [
    { pattern: /\b(\d+)(st|nd|rd|th)\s+season\b/i, getNum: (m) => m[1] },
    { pattern: /\bseason\s+(\d+)\b/i, getNum: (m) => m[1] },
    { pattern: /\bs(\d+)\b/i, getNum: (m) => m[1] },
    { pattern: /\b(\d+)$\b/i, getNum: (m) => m[1] }
  ];
  
  let seasonNum = null;
  let baseName = name;
  
  for (const rx of seasonRegexes) {
    const match = name.match(rx.pattern);
    if (match) {
      seasonNum = rx.getNum(match);
      baseName = name.replace(rx.pattern, '').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  
  if (seasonNum) {
    aliases.push(`${baseName} S${seasonNum}`);
    aliases.push(`${baseName} Temporada ${seasonNum}`);
    aliases.push(`${baseName} ${seasonNum}`);
    aliases.push(`${baseName} S${seasonNum} Latino`);
    aliases.push(`${baseName} Temporada ${seasonNum} Latino`);
  }
  
  return aliases;
}

// Multi-provider cascade scraper execution in parallel
async function getAnimeStreams(animeName, episodeNumber, host, protocol, seasonNumber) {
  const cacheKey = `${cleanName(animeName)}:${episodeNumber}`;
  const cached = streamCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_TTL_STREAMS)) {
    console.log(`[miColita Anime] [Cache] Streams for ${animeName} E${episodeNumber} loaded from cache.`);
    return cached.data;
  }

  // Detect season number from animeName if not passed explicitly (e.g. for Kitsu)
  let finalSeasonNumber = seasonNumber;
  if (!finalSeasonNumber) {
    const clean = (animeName || '').toLowerCase();
    const matchSeason = clean.match(/(?:season|temporada|s)\s*(\d+)/i) || 
                        clean.match(/(\d+)(?:nd|rd|th|st)\s*season/i);
    if (matchSeason) {
      finalSeasonNumber = parseInt(matchSeason[1], 10);
    } else {
      const matchEndDigit = clean.match(/\s+(\d+)$/);
      if (matchEndDigit) {
        finalSeasonNumber = parseInt(matchEndDigit[1], 10);
      } else {
        finalSeasonNumber = 1;
      }
    }
  }

  // 1. Resolve Romaji/Alternative titles from Kitsu
  const searchNames = [animeName];
  
  const addIfUnique = (name) => {
    if (name && !searchNames.includes(name)) {
      searchNames.push(name);
    }
  };

  // Inject aliases for the main title
  generateSeasonAliases(animeName).forEach(addIfUnique);

  const kitsuNames = await getAlternativeTitlesFromKitsu(animeName);
  if (kitsuNames && kitsuNames.length > 0) {
    kitsuNames.forEach(name => {
      addIfUnique(name);
      generateSeasonAliases(name).forEach(addIfUnique);
    });
  }

  console.log(`[miColita Anime] [Scraper] Attempting search with titles:`, searchNames);

  const providers = [
    { name: 'GnulaHD', service: gnulahdService },
    { name: 'TokiAnime', service: tokianimeService },
    { name: 'VerAnimeOnline', service: veranimeonlineService },
    { name: 'TioPlus', service: tioplusService },
    { name: 'Latanime', service: latanimeService },
    { name: 'TioAnime', service: tioanimeService },
    { name: 'AnimeFLV', service: animeflvService },
    { name: 'AnimeAV1', service: animeav1Service },
    { name: 'MonosChinos', service: monoschinosService },
    { name: 'JKAnime', service: jkanimeService }
  ];

  // Map each provider to a parallel worker promise
  const providerPromises = providers.map(async (prov) => {
    try {
      let slug = null;
      let searchedName = '';
      
      // Try search names in order of priority
      for (const name of searchNames) {
        console.log(`[miColita Anime] [Scraper] Querying ${prov.name} for: "${name}"`);
        
        // Timeout individual search requests to 4s to ensure overall speed
        slug = await Promise.race([
          findSlugInProvider(prov.service, name, prov.name),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Search Timeout')), 4000))
        ]).catch((err) => {
          console.warn(`[miColita Anime] [Scraper] ${prov.name} search timed out or failed:`, err.message);
          return null;
        });

        if (slug) {
          searchedName = name;
          break;
        }
      }

      if (slug) {
        console.log(`[miColita Anime] [Scraper] Slug found in ${prov.name}: "${slug}" (using "${searchedName}"). Resolving episode ${episodeNumber}...`);

        let episodeUrl = '';
        if (prov.name === 'GnulaHD') {
          if (!episodeNumber || episodeNumber === 0) {
            episodeUrl = `https://ww3.gnulahd.nu/ver/${slug}/`;
          } else {
            const paddedEp = String(episodeNumber).padStart(2, '0');
            episodeUrl = `https://ww3.gnulahd.nu/${slug}-${finalSeasonNumber}x${paddedEp}/`;
          }
        } else if (prov.name === 'VerAnimeOnline') {
          episodeUrl = `https://veranimeonline.co/episodio/${slug}-episodio-${episodeNumber}/`;
        } else if (prov.name === 'TioPlus') {
          episodeUrl = `https://tioplus.app/anime/${slug}/season/1/episode/${episodeNumber}`;
        } else if (prov.name === 'Latanime') {
          episodeUrl = `https://latanime.org/ver/${slug}-episodio-${episodeNumber}`;
        } else if (prov.name === 'TokiAnime') {
          episodeUrl = `https://tokianime.tv/watch/${slug}/${episodeNumber}`;
        } else if (prov.name === 'TioAnime') {
          episodeUrl = `https://tioanime.com/ver/${slug}-${episodeNumber}`;
        } else if (prov.name === 'AnimeFLV') {
          episodeUrl = `https://animeflv.net/ver/${slug}-${episodeNumber}`;
        } else if (prov.name === 'AnimeAV1') {
          episodeUrl = `https://animeav1.com/media/${slug}/${episodeNumber}`;
        } else if (prov.name === 'MonosChinos') {
          episodeUrl = `https://monoschinos2.com/ver/${slug}-episodio-${episodeNumber}`;
        } else if (prov.name === 'JKAnime') {
          episodeUrl = `https://jkanime.net/${slug}/${episodeNumber}/`;
        }

        // Fetch episode links with a 4s timeout
        const links = await Promise.race([
          prov.service.getEpisodeLinks(episodeUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Links Timeout')), 4000))
        ]).catch((err) => {
          console.warn(`[miColita Anime] [Scraper] ${prov.name} links resolution timed out or failed:`, err.message);
          return null;
        });

        if (links && links.success && links.data) {
          const data = links.data;
          
          let subLinks = data.streamLinks?.SUB || data.servers?.sub || [];
          let dubLinks = data.streamLinks?.DUB || data.servers?.dub || [];

          // Detección dinámica de página doblada basada en el slug
          const isDubbedSlug = /latino|doblaje|doblado|castellano|dub\b/i.test(slug);
          if (isDubbedSlug) {
            console.log(`[miColita Anime] [Slug Override] Detectado slug doblado "${slug}". Promoviendo todos los enlaces a DUB.`);
            dubLinks = [...dubLinks, ...subLinks];
            subLinks = [];
          }

          console.log(`[miColita Anime] [Scraper] Successfully extracted ${subLinks.length} SUB and ${dubLinks.length} DUB servers from ${prov.name}`);

          const localStreams = [];

          // Process SUB links (Jap sub Esp)
          subLinks.forEach((link) => {
            const cleanServer = link.server.toUpperCase();
            const isUnstreamable = /mega|1fichier/i.test(link.server);
            
            if (!isUnstreamable) {
              const playDirectUrl = `${protocol}://${host}/play/direct?url=${encodeURIComponent(link.url)}&id=${cleanName(animeName)}_E${episodeNumber}_${cleanName(link.server)}`;
              localStreams.push({
                name: `miColita\n${prov.name}`,
                type: 'url',
                title: `⭐ [NATIVO] [SUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Jap (Sub Esp)\n🎬 Reproducción nativa en reproductor interno\n⚡ Resolvedor inteligente de video en tiempo real`,
                url: playDirectUrl
              });
            }
          });

          // Process DUB links (Spanish Dub / Audio Dual)
          dubLinks.forEach((link) => {
            const cleanServer = link.server.toUpperCase();
            const isUnstreamable = /mega|1fichier/i.test(link.server);

            if (!isUnstreamable) {
              const playDirectUrl = `${protocol}://${host}/play/direct?url=${encodeURIComponent(link.url)}&id=${cleanName(animeName)}_E${episodeNumber}_${cleanName(link.server)}`;
              localStreams.push({
                name: `miColita\n${prov.name}`,
                type: 'url',
                title: `⭐ [NATIVO] [DUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Español Latino/Castellano\n🎬 Reproducción nativa en reproductor interno\n⚡ Resolvedor inteligente de video en tiempo real`,
                url: playDirectUrl
              });
            }
          });

          return localStreams;
        }
      }
    } catch (err) {
      console.error(`[miColita Anime] [Scraper] Error in provider ${prov.name}:`, err.message);
    }
    return [];
  });

  // Run all scrapers in parallel
  const results = await Promise.allSettled(providerPromises);
  const streams = [];

  results.forEach((res) => {
    if (res.status === 'fulfilled' && res.value) {
      streams.push(...res.value);
    }
  });

  // Sort streams prioritizing GnulaHD Latino, then other Latino, then GnulaHD Castellano, then other Castellano, then Subs
  const sortedStreams = [...streams].sort((a, b) => {
    const getScore = (s) => {
      const title = (s.title || '').toUpperCase();
      const name = (s.name || '').toUpperCase();
      
      if (name.includes('GNULA') && title.includes('LATINO')) {
        return 100;
      }
      if (title.includes('LATINO')) {
        return 90;
      }
      if (name.includes('GNULA') && title.includes('CASTELLANO')) {
        return 80;
      }
      if (title.includes('CASTELLANO')) {
        return 70;
      }
      return 0;
    };
    return getScore(b) - getScore(a);
  });

  if (sortedStreams.length > 0) {
    streamCache.set(cacheKey, { data: sortedStreams, timestamp: now });
  }

  return sortedStreams;
}

// Landing page generator with Premium Anime aesthetics
function getLandingPageHtml(host, protocol) {
  const manifestUrl = `${protocol}://${host}/manifest.json`;
  const stremioUrl = manifestUrl.replace(/^http/, 'stremio');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>miColita Anime | Stremio Addon</title>
    <meta name="description" content="Addon premium de Stremio para ver Anime en español de forma nativa, veloz y organizada.">
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <!-- FontAwesome icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        :root {
            --bg-color: #03000a;
            --card-bg: rgba(12, 5, 23, 0.45);
            --border-color: rgba(186, 104, 255, 0.15);
            --text-primary: #ffffff;
            --text-secondary: #c7b9e0;
            --accent-primary: #ec4899;
            --accent-secondary: #8b5cf6;
            --glow-color: rgba(236, 72, 153, 0.4);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            overflow-x: hidden;
            background-image: 
                radial-gradient(circle at 15% 20%, rgba(236, 72, 153, 0.12) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(139, 92, 246, 0.12) 0%, transparent 40%),
                linear-gradient(rgba(186, 104, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(186, 104, 255, 0.03) 1px, transparent 1px);
            background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
        }

        .container {
            max-width: 900px;
            width: 100%;
            padding: 40px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        /* Glassmorphic card */
        .card {
            background: var(--card-bg);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border: 1px solid var(--border-color);
            border-radius: 28px;
            padding: 60px 40px;
            width: 100%;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            position: relative;
            overflow: hidden;
            transition: transform 0.3s ease;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
        }

        .logo-container {
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 24px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 30px;
            box-shadow: 0 12px 30px var(--glow-color);
            animation: float 4s ease-in-out infinite;
        }

        .logo-container i {
            font-size: 46px;
            color: #ffffff;
        }

        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 52px;
            font-weight: 800;
            letter-spacing: -1px;
            margin-bottom: 15px;
            background: linear-gradient(135deg, #ffffff 30%, #ec4899 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            font-size: 18px;
            color: var(--text-secondary);
            max-width: 650px;
            margin-bottom: 40px;
            line-height: 1.6;
        }

        /* Buttons and Inputs */
        .actions {
            display: flex;
            flex-direction: column;
            gap: 15px;
            width: 100%;
            max-width: 500px;
            margin-bottom: 45px;
        }

        .btn {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            padding: 18px 30px;
            border-radius: 16px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s ease;
            text-decoration: none;
            width: 100%;
            border: none;
            outline: none;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            color: #ffffff;
            box-shadow: 0 10px 25px var(--glow-color);
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 35px rgba(236, 72, 153, 0.6);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .input-group {
            position: relative;
            width: 100%;
            max-width: 500px;
            margin-bottom: 35px;
        }

        .input-group input {
            width: 100%;
            padding: 18px 120px 18px 22px;
            border-radius: 16px;
            background: rgba(5, 2, 12, 0.6);
            border: 1px solid rgba(186, 104, 255, 0.2);
            color: #ffffff;
            font-size: 14px;
            outline: none;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
            transition: border-color 0.3s;
        }

        .input-group input:focus {
            border-color: var(--accent-primary);
            box-shadow: 0 0 10px rgba(236, 72, 153, 0.15);
        }

        .input-group button.copy-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(139, 92, 246, 0.2));
            border: 1px solid rgba(236, 72, 153, 0.3);
            border-radius: 12px;
            padding: 10px 16px;
            color: #ffffff;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .input-group button.copy-btn:hover {
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-color: transparent;
        }

        /* Features Section */
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 25px;
            width: 100%;
            margin-top: 25px;
        }

        .feature-card {
            background: rgba(186, 104, 255, 0.03);
            border: 1px solid rgba(186, 104, 255, 0.06);
            border-radius: 20px;
            padding: 25px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            transition: all 0.3s ease;
        }

        .feature-card:hover {
            background: rgba(186, 104, 255, 0.06);
            border-color: rgba(236, 72, 153, 0.25);
            transform: translateY(-3px);
        }

        .feature-card i {
            font-size: 28px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .feature-card h3 {
            font-size: 15px;
            font-weight: 700;
            color: #ffffff;
        }

        .feature-card p {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.4;
        }

        /* Footer */
        footer {
            margin-top: 50px;
            font-size: 12px;
            color: rgba(199, 185, 224, 0.4);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        footer a {
            color: var(--text-secondary);
            text-decoration: none;
            transition: color 0.2s;
        }

        footer a:hover {
            color: var(--accent-primary);
        }

        /* Animations */
        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
            100% { transform: translateY(0px); }
        }

        @media (max-width: 600px) {
            h1 { font-size: 38px; }
            .card { padding: 40px 20px; }
            .features { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div style="display: flex; justify-content: center; width: 100%;">
                <div class="logo-container">
                    <i class="fa-solid fa-fire-flame-curved"></i>
                </div>
            </div>
            
            <h1>miColita Anime</h1>
            <p class="subtitle">Disfruta del mejor Anime en Stremio con audio Japonés (Subtitulado en Español) o Doblaje Latino/Castellano de manera instantánea y gratuita.</p>
            
            <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div class="actions">
                    <a href="${stremioUrl}" class="btn btn-primary">
                        <i class="fa-solid fa-circle-plus"></i> Instalar en Stremio
                    </a>
                </div>

                <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px;">
                    O copia el enlace del manifest para instalarlo manualmente:
                </div>

                <div class="input-group">
                    <input type="text" id="manifest-url" value="${manifestUrl}" readonly>
                    <button class="copy-btn" onclick="copyManifestUrl()"><i class="fa-regular fa-copy"></i> Copiar</button>
                </div>
            </div>

            <div class="features">
                <div class="feature-card">
                    <i class="fa-solid fa-clapperboard"></i>
                    <h3>Multi-Proveedor</h3>
                    <p>Integración en cascada con AnimeFLV, TioAnime, MonosChinos, AnimeAV1 y JKAnime.</p>
                </div>
                <div class="feature-card">
                    <i class="fa-solid fa-language"></i>
                    <h3>SUB y DUB</h3>
                    <p>Categorizado de streams en audio original subtitulado o doblaje en español.</p>
                </div>
                <div class="feature-card">
                    <i class="fa-solid fa-bolt"></i>
                    <h3>NATIVO Premium</h3>
                    <p>Resolvedor en tiempo real de enlaces de video directos para reproducción sin abrir navegador.</p>
                </div>
            </div>
        </div>

        <footer>
            <span>Creado con ❤️ para Stremio • Desarrollado por Antigravity</span>
            <div>
                <a href="${manifestUrl}" target="_blank">Ver manifest.json <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 9px;"></i></a>
            </div>
        </footer>
    </div>

    <script>
        function copyManifestUrl() {
            const copyText = document.getElementById("manifest-url");
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value);

            const btn = document.querySelector('.copy-btn');
            btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
            btn.style.background = '#ec4899';
            
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
                btn.style.background = 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(139, 92, 246, 0.2))';
            }, 2500);
        }
    </script>
</body>
</html>
  `;
}

// Landing page route
app.get('/', (req, res) => {
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getLandingPageHtml(host, protocol));
});

// Stremio manifest route
app.get('/manifest.json', (req, res) => {
  res.json(MANIFEST);
});

// Helper to construct a base64url-encoded proxy stream URL
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

// Helper to resolve relative URLs against a base URL
function resolveUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    return url;
  }
}

// Helper to rewrite absolute and relative URLs inside an HLS .m3u8 playlist to use the proxy
function rewritePlaylist(playlistText, baseDirUrl, host, protocol) {
  const lines = playlistText.split('\n');
  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      // Rewrite URIs in tags (like EXT-X-MAP or EXT-X-KEY)
      return line.replace(/URI=["']([^"']+)["']/g, (match, url) => {
        const absoluteUrl = resolveUrl(url, baseDirUrl);
        let proxied = getProxyUrl(absoluteUrl, host, protocol);
        // Replace .html extension with .mp4 to bypass ExoPlayer extension/MIME strict checks
        if (absoluteUrl.includes('.html')) {
          proxied = proxied.replace(/\.html(\?|$)/, '.mp4$1');
        }
        return `URI="${proxied}"`;
      });
    } else {
      // It is a segment or sub-playlist URL line
      const absoluteUrl = resolveUrl(trimmed, baseDirUrl);
      let proxied = getProxyUrl(absoluteUrl, host, protocol);
      if (absoluteUrl.includes('.html')) {
        proxied = proxied.replace(/\.html(\?|$)/, '.mp4$1');
      }
      return proxied;
    }
  });
  return rewrittenLines.join('\n');
}

// Real-time redirect play route using the download.service.js resolveEmbedUrl function
app.get('/play/direct', async (req, res) => {
  const { url, id } = req.query;
  if (!url) {
    return res.status(400).send('Falta el parámetro url');
  }

  console.log(`[miColita Anime] [/play/direct] Request to resolve direct link for: ${id} (${url})`);

  try {
    const directUrl = await resolveToDirectLink(url, url);
    if (directUrl) {
      // Check if URL requires universal streaming proxy (VOE, YourUpload, Zilla HLS, Streamwish CDN, TokiAnime, GnulaHD, Google Video, Mp4Upload, etc.)
      const isRestrictive = /cloudwindow-route|voe|yourupload|zilla-networks|streamwish|sfastwish|flaswish|tokianime|gnulahd|they\.tube|premilkyway|awishcdn|niramirus|hgplaycdn|hglamioz|medixiru|owphbf24|bysevepoin|sprintcdn|googlevideo\.com|redirector\.googlevideo|mp4upload/i.test(directUrl) || 
                            directUrl.includes('kjhhiuahiuhgihdf') ||
                            /voe|yourupload|streamwish|sfastwish|flaswish|tokianime|gnulahd|they\.tube|premilkyway|awishcdn|niramirus|hgplaycdn|hglamioz|medixiru|owphbf24|bysevepoin|sprintcdn|googlevideo\.com|redirector\.googlevideo|mp4upload/i.test(url);
      
      if (isRestrictive) {
        const host = req.get('host');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const proxiedUrl = getProxyUrl(directUrl, host, protocol);
        console.log(`[miColita Anime] [/play/direct] Redirecting restrictive stream (VOE/YourUpload/Zilla/Streamwish/TokiAnime/GnulaHD) through universal proxy: ${proxiedUrl.substring(0, 100)}...`);
        return res.redirect(302, proxiedUrl);
      } else {
        console.log(`[miColita Anime] [/play/direct] Redirecting to direct stream (unrestricted): ${directUrl.substring(0, 100)}...`);
        return res.redirect(302, directUrl);
      }
    }
  } catch (err) {
    console.error(`[miColita Anime] [/play/direct] Failed resolving embed to direct link:`, err.message);
  }

  console.log(`[miColita Anime] [/play/direct] Redirecting to fallback external url: ${url}`);
  return res.redirect(302, url);
});

// Universal stream proxy to bypass IP/ASN/Referer and MIME type restrictions (VOE, YourUpload, Zilla)
app.get('/play/proxy/:encodedDir/*', async (req, res) => {
  const { encodedDir } = req.params;
  let filename = req.params[0];
  
  try {
    const baseDirUrl = Buffer.from(encodedDir, 'base64url').toString('utf8');
    
    // Extract exact raw query string from req.originalUrl to prevent Express decoding/encoding issues
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex !== -1 ? req.originalUrl.substring(queryIndex + 1) : '';
    
    // Revert .mp4 extension override back to .html for CDN requests (Zilla networks)
    let cdnFilename = filename;
    if (baseDirUrl.includes('zilla-networks.com') && filename.includes('.mp4')) {
      cdnFilename = filename.replace(/\.mp4(\?|$)/, '.html$1');
    }
    
    const targetUrl = `${baseDirUrl}${cdnFilename}${queryString ? '?' + queryString : ''}`;
    
    console.log(`[miColita Anime] [Proxy] Proxying request to: ${targetUrl.substring(0, 100)}...`);
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...(req.headers.range ? { 'Range': req.headers.range } : {})
    };
    
    // Automatically apply referer based on target domain
    if (targetUrl.includes('voe') || targetUrl.includes('cloudwindow-route.com')) {
      headers['Referer'] = 'https://voe.sx/';
    } else if (targetUrl.includes('yourupload')) {
      headers['Referer'] = 'https://www.yourupload.com/';
    } else if (targetUrl.includes('filemoon')) {
      headers['Referer'] = 'https://filemoon.sx/';
    } else if (targetUrl.includes('kjhhiuahiuhgihdf') || /streamwish|sfastwish|flaswish|premilkyway|awishcdn|niramirus|hgplaycdn|hglamioz|medixiru|owphbf24|bysevepoin|sprintcdn/i.test(targetUrl)) {
      headers['Referer'] = 'https://sfastwish.com/';
    } else if (targetUrl.includes('tokianime.tv')) {
      headers['Referer'] = 'https://tokianime.tv/';
    } else if (targetUrl.includes('they.tube') || targetUrl.includes('gnulahd.nu')) {
      headers['Referer'] = 'https://ww3.gnulahd.nu/';
    } else if (targetUrl.includes('mp4upload')) {
      headers['Referer'] = 'https://www.mp4upload.com/';
    } else if (targetUrl.includes('googlevideo.com') || targetUrl.includes('redirector.googlevideo.com')) {
      headers['Referer'] = 'https://www.blogger.com/';
    }
    
    const isPlaylist = filename.includes('.m3u8') || 
                       req.url.includes('.m3u8') || 
                       targetUrl.includes('/m3u8/') || 
                       targetUrl.includes('.m3u8') ||
                       targetUrl.includes('mode=play');
    
    if (isPlaylist) {
      // Fetch playlist as text to rewrite URLs inside it to use our proxy
      const response = await axios.get(targetUrl, {
        headers,
        responseType: 'text',
        timeout: 15000,
        httpAgent: keepAliveHttpAgent,
        httpsAgent: keepAliveAgent
      });
      
      const host = req.get('host');
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      
      const parsedTarget = new URL(targetUrl);
      const lastSlash = parsedTarget.pathname.lastIndexOf('/');
      const targetBaseDir = `${parsedTarget.origin}${parsedTarget.pathname.substring(0, lastSlash + 1)}`;
      
      const rewrittenBody = rewritePlaylist(response.data, targetBaseDir, host, protocol);
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewrittenBody);
    } else {
      // Fetch binary segments/files as stream
      const controller = new AbortController();
      const bufferStream = new PassThrough({ highWaterMark: 1024 * 1024 }); // 1MB Memory Buffer for smoother playback
      
      req.on('close', () => {
        if (!res.writableEnded) {
          console.log(`[miColita Anime] [Proxy] Client closed connection. Aborting upstream request.`);
          controller.abort();
          bufferStream.destroy();
        }
      });

      const response = await axios.get(targetUrl, {
        headers,
        responseType: 'stream',
        timeout: 15000,
        signal: controller.signal,
        httpAgent: keepAliveHttpAgent,
        httpsAgent: keepAliveAgent
      });
      
      let contentType = response.headers['content-type'] || 'application/octet-stream';
      // Force correct video MIME type for Zilla .html fMP4 segments to prevent ExoPlayer crashes in Stremio
      if (targetUrl.includes('zilla-networks.com') && targetUrl.includes('.html')) {
        contentType = 'video/mp4';
      }
      
      // Cache-Control headers for media segments to optimize player-side buffering
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', contentType);
      if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
      if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
      if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
      res.status(response.status);
      
      return response.data.pipe(bufferStream).pipe(res);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ERR_CANCELED' || axios.isCancel(err)) {
      console.log(`[miColita Anime] [Proxy] Upstream request successfully aborted.`);
      return;
    }
    console.error(`[miColita Anime] [Proxy] Error proxying stream:`, err.message);
    if (!res.headersSent) {
      res.status(500).send(`Error de proxy: ${err.message}`);
    }
  }
});

// Universal Stremio Stream Route supporting all prefixes
app.get('/stream/:type/:id.json', async (req, res) => {
  let { type, id } = req.params;
  id = id.replace('.json', '');

  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;

  console.log(`[miColita Anime] Stream request - Type: ${type}, ID: ${id}`);

  let animeId = '';
  let episodeNumber = 1;
  let seasonNumber = null;

  if (id.startsWith('kitsu:')) {
    const parts = id.split(':');
    animeId = `kitsu:${parts[1]}`;
    episodeNumber = parseInt(parts[2] || '1', 10);
  } else if (id.startsWith('tt')) {
    const parts = id.split(':');
    animeId = parts[0];
    if (parts.length >= 3) {
      seasonNumber = parseInt(parts[1] || '1', 10);
      episodeNumber = parseInt(parts[2] || '1', 10);
    }
  } else {
    return res.json({ streams: [] });
  }

  try {
    const meta = await getAnimeMeta(animeId, type);
    if (!meta || !meta.name) {
      console.log(`[miColita Anime] Could not resolve metadata for ID: ${animeId}`);
      return res.json({ streams: [] });
    }

    const animeName = meta.name;
    console.log(`[miColita Anime] Resolved title: "${animeName}" (Episode: ${episodeNumber})`);

    const streams = await getAnimeStreams(animeName, episodeNumber, host, protocol, seasonNumber);
    return res.json({ streams });
  } catch (err) {
    console.error(`[miColita Anime] Error processing streams for ${id}:`, err.message);
    return res.json({ streams: [] });
  }
});

// Route to manually clear memory caches
app.get('/clear-cache', (req, res) => {
  metaCache.clear();
  streamCache.clear();
  directLinkCache.clear();
  console.log(`[miColita Anime] [Cache] All memory caches manually cleared by user request.`);
  return res.send('Caché limpiado correctamente.');
});

app.getAnimeStreams = getAnimeStreams;
module.exports = app;
