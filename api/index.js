const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// Scraper services
const { resolveEmbedUrl } = require('./scraper/download.service');
const tioanimeService = require('./scraper/tioanime.service');
const animeflvService = require('./scraper/animeflv.service');
const animeav1Service = require('./scraper/animeav1.service');
const monoschinosService = require('./scraper/monoschinos.service');
const jkanimeService = require('./scraper/jkanime.service');

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
    .replace(/[^a-z0-9\s]/g, "") // remove special chars
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
      const response = await axios.get(url, { timeout: 10000 });
      if (response.data && response.data.meta) {
        metaCache.set(cacheKey, { data: response.data.meta, timestamp: now });
        return response.data.meta;
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
      const targetClean = cleanName(animeName);

      // 1. Check exact match
      for (const res of results) {
        if (cleanName(res.title) === targetClean) {
          return res.slug;
        }
      }

      // 2. Check fuzzy match
      for (const res of results) {
        const cleanResTitle = cleanName(res.title);
        if (cleanResTitle.includes(targetClean) || targetClean.includes(cleanResTitle)) {
          return res.slug;
        }
      }

      // 3. Fallback to first result
      return results[0].slug;
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

// Multi-provider cascade scraper execution
async function getAnimeStreams(animeName, episodeNumber, host, protocol) {
  const cacheKey = `${cleanName(animeName)}:${episodeNumber}`;
  const cached = streamCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_TTL_STREAMS)) {
    console.log(`[miColita Anime] [Cache] Streams for ${animeName} E${episodeNumber} loaded from cache.`);
    return cached.data;
  }

  const providers = [
    { name: 'TioAnime', service: tioanimeService },
    { name: 'AnimeFLV', service: animeflvService },
    { name: 'AnimeAV1', service: animeav1Service },
    { name: 'MonosChinos', service: monoschinosService },
    { name: 'JKAnime', service: jkanimeService }
  ];

  const streams = [];

  for (const prov of providers) {
    try {
      console.log(`[miColita Anime] [Scraper] Querying ${prov.name} for: "${animeName}"`);
      const slug = await findSlugInProvider(prov.service, animeName, prov.name);
      if (slug) {
        console.log(`[miColita Anime] [Scraper] Slug found in ${prov.name}: "${slug}". Resolving episode ${episodeNumber}...`);

        let episodeUrl = '';
        if (prov.name === 'TioAnime') {
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

        const links = await prov.service.getEpisodeLinks(episodeUrl);
        if (links && links.success && links.data) {
          const data = links.data;
          
          const subLinks = data.streamLinks?.SUB || data.servers?.sub || [];
          const dubLinks = data.streamLinks?.DUB || data.servers?.dub || [];

          console.log(`[miColita Anime] [Scraper] Successfully extracted ${subLinks.length} SUB and ${dubLinks.length} DUB servers from ${prov.name}`);

          // Process SUB links (Jap sub Esp)
          subLinks.forEach((link) => {
            const cleanServer = link.server.toUpperCase();
            const playDirectUrl = `${protocol}://${host}/play/direct?url=${encodeURIComponent(link.url)}&id=${cleanName(animeName)}_E${episodeNumber}_${cleanName(link.server)}`;
            
            // 1. [NATIVO] Direct play redirect stream (plays inside Stremio)
            streams.push({
              name: `miColita\n${prov.name}`,
              type: 'url',
              title: `⭐ [NATIVO] [SUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Jap (Sub Esp)\n🎬 Reproducción nativa en reproductor interno\n⚡ Resolvedor inteligente de video en tiempo real`,
              url: playDirectUrl
            });

            // 2. [EMBED] Standard redirect embed (opens in browser as backup)
            streams.push({
              name: `miColita\n${prov.name}`,
              type: 'embed',
              title: `🔗 [EMBED] [SUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Jap (Sub Esp)\n🌐 Abre en el navegador (Opción tradicional)`,
              externalUrl: link.url
            });
          });

          // Process DUB links (Spanish Dub / Audio Dual)
          dubLinks.forEach((link) => {
            const cleanServer = link.server.toUpperCase();
            const playDirectUrl = `${protocol}://${host}/play/direct?url=${encodeURIComponent(link.url)}&id=${cleanName(animeName)}_E${episodeNumber}_${cleanName(link.server)}`;

            // 1. [NATIVO] Direct play redirect stream (plays inside Stremio)
            streams.push({
              name: `miColita\n${prov.name}`,
              type: 'url',
              title: `⭐ [NATIVO] [DUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Español Latino/Castellano\n🎬 Reproducción nativa en reproductor interno\n⚡ Resolvedor inteligente de video en tiempo real`,
              url: playDirectUrl
            });

            // 2. [EMBED] Standard redirect embed (opens in browser as backup)
            streams.push({
              name: `miColita\n${prov.name}`,
              type: 'embed',
              title: `🔗 [EMBED] [DUB] ${cleanServer}\n📺 Cap. ${episodeNumber} • Audio: Español Latino/Castellano\n🌐 Abre en el navegador (Opción tradicional)`,
              externalUrl: link.url
            });
          });

          // Short-circuit cascade for massive speed
          if (streams.length > 0) {
            console.log(`[miColita Anime] [Scraper] Found ${streams.length} streams in ${prov.name}. Stopping provider cascade.`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(`[miColita Anime] [Scraper] Error in provider ${prov.name}:`, err.message);
    }
  }

  if (streams.length > 0) {
    streamCache.set(cacheKey, { data: streams, timestamp: now });
  }

  return streams;
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
      console.log(`[miColita Anime] [/play/direct] Redirecting to direct stream: ${directUrl.substring(0, 100)}...`);
      return res.redirect(302, directUrl);
    }
  } catch (err) {
    console.error(`[miColita Anime] [/play/direct] Failed resolving embed to direct link:`, err.message);
  }

  console.log(`[miColita Anime] [/play/direct] Redirecting to fallback external url: ${url}`);
  return res.redirect(302, url);
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

  if (id.startsWith('kitsu:')) {
    const parts = id.split(':');
    animeId = `kitsu:${parts[1]}`;
    episodeNumber = parseInt(parts[2] || '1', 10);
  } else if (id.startsWith('tt')) {
    const parts = id.split(':');
    animeId = parts[0];
    if (parts.length >= 3) {
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

    const streams = await getAnimeStreams(animeName, episodeNumber, host, protocol);
    return res.json({ streams });
  } catch (err) {
    console.error(`[miColita Anime] Error processing streams for ${id}:`, err.message);
    return res.json({ streams: [] });
  }
});

module.exports = app;
