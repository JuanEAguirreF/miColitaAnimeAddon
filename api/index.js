const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Addon Manifest Definition
const MANIFEST = {
  id: 'org.micolita.addon',
  version: '1.0.0',
  name: 'Micolita',
  description: 'VsEmbed mirror provider addon for Stremio with automatic Spanish subtitles. Dynamically updates and rotates live active domains from vidsrc.domains.',
  logo: 'https://i.imgur.com/9dH9RHB.jpg',
  background: 'https://i.imgur.com/9dH9RHB.jpg',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: []
};

// Fallback Mirror Domains configuration if dynamic fetch fails
let cachedMirrors = [
  { domain: 'vidsrc-embed.ru', label: 'Mirror Main A' },
  { domain: 'vidsrc-embed.su', label: 'Mirror Main B' },
  { domain: 'vidsrcme.ru', label: 'Mirror Core A' },
  { domain: 'vidsrcme.su', label: 'Mirror Core B' },
  { domain: 'vidsrc-me.ru', label: 'Mirror Alternate A' },
  { domain: 'vidsrc-me.su', label: 'Mirror Alternate B' },
  { domain: 'vsrc.su', label: 'Mirror Backup' }
];
let lastFetched = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache to avoid rate-limiting and latency

// Dynamic domain resolver from vidsrc.domains
async function getActiveMirrors() {
  const now = Date.now();
  if (now - lastFetched < CACHE_DURATION) {
    return cachedMirrors;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds request timeout

    const response = await fetch('https://vidsrc.domains/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    const html = await response.text();
    
    // Regex matching Live domains in: <li><a href="https://vidsrcme.ru">vidsrcme.ru<span class="live-text">Live</span><span class="dot"></span></a></li>
    const regex = /<a href="https?:\/\/([^"]+)">([^<]+)<span class="live-text">Live<\/span>/g;
    let match;
    const foundDomains = [];

    while ((match = regex.exec(html)) !== null) {
      const domain = match[1].replace(/\/$/, '').trim();
      if (domain && !foundDomains.includes(domain)) {
        foundDomains.push(domain);
      }
    }

    if (foundDomains.length > 0) {
      cachedMirrors = foundDomains.map((dom, idx) => {
        let label = `Mirror ${idx + 1}`;
        if (dom.includes('embed')) label = `Mirror Embed ${dom.includes('.su') ? 'B' : 'A'}`;
        else if (dom.includes('vidsrcme')) label = `Mirror Core ${dom.includes('.su') ? 'B' : 'A'}`;
        else if (dom.includes('vidsrc-me')) label = `Mirror Alt ${dom.includes('.su') ? 'B' : 'A'}`;
        else if (dom.includes('vsrc')) label = `Mirror Backup`;
        
        return { domain: dom, label };
      });
      lastFetched = now;
      console.log(`[Micolita] Dynamic mirrors successfully updated from vidsrc.domains:`, foundDomains);
    }
  } catch (error) {
    console.error(`[Micolita] Error fetching active domains from vidsrc.domains, using cached/fallback mirrors:`, error.message);
    // Suppress repeated calls for 2 minutes to avoid spamming on failure
    lastFetched = now - CACHE_DURATION + (2 * 60 * 1000);
  }

  return cachedMirrors;
}

// Beautiful landing page HTML generator
function getLandingPageHtml(host, protocol) {
  const manifestUrl = `${protocol}://${host}/manifest.json`;
  const stremioUrl = manifestUrl.replace(/^http/, 'stremio');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Micolita | Stremio Addon</title>
    <meta name="description" content="Addon de Stremio premium para reproducir series y películas con subtítulos en español automáticamente usando servidores de alta velocidad.">
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <!-- FontAwesome icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        :root {
            --bg-color: #080710;
            --card-bg: rgba(255, 255, 255, 0.03);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #ffffff;
            --text-secondary: #94a3b8;
            --accent-primary: #8b5cf6;
            --accent-secondary: #06b6d4;
            --glow-color: rgba(139, 92, 246, 0.35);
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
                radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(6, 182, 212, 0.15) 0%, transparent 40%);
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

        /* Glassmorphic main card */
        .card {
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 50px 40px;
            width: 100%;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            position: relative;
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
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
            width: 90px;
            height: 90px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 25px;
            box-shadow: 0 10px 25px var(--glow-color);
            animation: float 4s ease-in-out infinite;
        }

        .logo-container i {
            font-size: 42px;
            color: #ffffff;
        }

        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 48px;
            font-weight: 800;
            letter-spacing: -1px;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #ffffff 40%, #c084fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            font-size: 18px;
            color: var(--text-secondary);
            max-width: 600px;
            margin-bottom: 35px;
            line-height: 1.6;
        }

        /* Buttons and Inputs */
        .actions {
            display: flex;
            flex-direction: column;
            gap: 15px;
            width: 100%;
            max-width: 500px;
            margin-bottom: 40px;
        }

        .btn {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            padding: 16px 28px;
            border-radius: 14px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s ease;
            text-decoration: none;
            width: 100%;
            border: none;
            outline: none;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-primary), #7c3aed);
            color: #ffffff;
            box-shadow: 0 8px 20px var(--glow-color);
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(139, 92, 246, 0.5);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .input-group {
            position: relative;
            width: 100%;
            max-width: 500px;
            margin-bottom: 30px;
        }

        .input-group input {
            width: 100%;
            padding: 16px 50px 16px 20px;
            border-radius: 14px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border-color);
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
        }

        .input-group i.fa-link {
            position: absolute;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-secondary);
            font-size: 16px;
        }

        .input-group button.copy-btn {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.08);
            border: none;
            border-radius: 10px;
            padding: 8px 14px;
            color: var(--text-primary);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .input-group button.copy-btn:hover {
            background: var(--accent-primary);
        }

        /* Features Section */
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 150px));
            gap: 20px;
            justify-content: center;
            width: 100%;
            margin-top: 20px;
        }

        .feature-card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            transition: background 0.3s, border-color 0.3s;
        }

        .feature-card:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .feature-card i {
            font-size: 24px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .feature-card h3 {
            font-size: 14px;
            font-weight: 700;
        }

        .feature-card p {
            font-size: 12px;
            color: var(--text-secondary);
            line-height: 1.4;
        }

        /* Footer */
        footer {
            margin-top: 40px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.3);
            display: flex;
            flex-direction: column;
            gap: 5px;
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
            h1 { font-size: 36px; }
            .card { padding: 35px 20px; }
            .features { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div style="display: flex; justify-content: center; width: 100%;">
                <div class="logo-container">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>
            </div>
            
            <h1>Micolita</h1>
            <p class="subtitle">Disfruta de películas y series en Stremio con subtítulos en español automáticos. Alojado en la nube con respaldo ultra-rápido en múltiples servidores.</p>
            
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
                    <i class="fa-solid fa-language"></i>
                    <h3>Subs en Español</h3>
                    <p>Subtítulos en español configurados y activos por defecto.</p>
                </div>
                <div class="feature-card">
                    <i class="fa-solid fa-server"></i>
                    <h3>Mirrors Dinámicos</h3>
                    <p>Rotación activa de dominios en vivo desde vidsrc.domains.</p>
                </div>
                <div class="feature-card">
                    <i class="fa-solid fa-bolt"></i>
                    <h3>Sin Límites</h3>
                    <p>Instalación en un clic compatible con PC, Smart TV y Móvil.</p>
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
            btn.style.background = '#10b981';
            
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
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

// Función para resolver enlaces directos usando Puppeteer (solo VPS/Docker)
async function getDirectStreamM3u8(embedUrl) {
  if (process.env.RESOLVE_DIRECT_LINKS !== 'true') return null;

  console.log(`[Micolita] [Resolver] Iniciando resolución para: ${embedUrl}`);
  let browser;
  try {
    let puppeteer;
    try {
      const pkgExtra = 'puppeteer-extra';
      const pkgStealth = 'puppeteer-extra-plugin-stealth';
      puppeteer = require(pkgExtra);
      const StealthPlugin = require(pkgStealth);
      puppeteer.use(StealthPlugin());
      console.log(`[Micolita] [Resolver] Utilizando puppeteer-extra + stealth plugin.`);
    } catch (e) {
      console.log(`[Micolita] [Resolver] puppeteer-extra o stealth no disponibles, intentando puppeteer estándar:`, e.message);
      try {
        const pkg = 'puppeteer';
        puppeteer = require(pkg);
      } catch (err) {
        console.error('[Micolita] [Resolver] Error cargando Puppeteer:', err.message);
        return null;
      }
    }

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1280,720'
      ]
    };
    
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    console.log(`[Micolita] [Resolver] Lanzando navegador Puppeteer...`);
    browser = await puppeteer.launch(launchOptions);
    console.log(`[Micolita] [Resolver] Navegador lanzado con éxito. Creando página...`);
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const embedOrigin = new URL(embedUrl).origin;
    await page.setExtraHTTPHeaders({
      'Referer': `${embedOrigin}/`,
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    });
    
    let m3u8Url = null;
    
    // Activar interceptación de red para bloquear recursos pesados y anuncios
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      
      if (url.includes('.m3u8') && !url.includes('adserver') && !url.includes('doubleclick') && !url.includes('analytics')) {
        m3u8Url = url;
        console.log(`[Micolita] [Resolver] ¡Enlace .m3u8 detectado en peticiones de red! -> ${url.substring(0, 80)}...`);
      }
      
      const isAdOrTracker = url.includes('adserver') || 
                            url.includes('doubleclick') || 
                            url.includes('analytics') || 
                            url.includes('google-analytics') || 
                            url.includes('ads') || 
                            url.includes('pop') ||
                            url.includes('click') ||
                            url.includes('histats') ||
                            url.includes('disable-devtool') ||
                            url.includes('stats');
                            
      if (isAdOrTracker) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    // Navegación (timeout de 25s)
    console.log(`[Micolita] [Resolver] Navegando a la URL del embed...`);
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    console.log(`[Micolita] [Resolver] Página cargada (domcontentloaded). Esperando enlace directo final...`);
    
    // Esperar y hacer click
    const startTime = Date.now();
    let clickedPlay = false;
    
    while (!m3u8Url && (Date.now() - startTime < 15000)) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > 4000 && !clickedPlay) {
        clickedPlay = true;
        console.log('[Micolita] [Resolver] Haciendo click en el centro de la pantalla para iniciar reproducción...');
        try {
          await page.mouse.click(640, 360);
        } catch (clickErr) {
          console.error('[Micolita] [Resolver] Error al hacer click:', clickErr.message);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (m3u8Url) {
      console.log(`[Micolita] [Resolver] Éxito: Enlace extraído correctamente.`);
    } else {
      console.log(`[Micolita] [Resolver] Falló: No se detectó ninguna petición de stream .m3u8 dentro de los límites de tiempo.`);
    }
    
    return m3u8Url;
  } catch (error) {
    console.error(`[Micolita] [Resolver] Error en el proceso de Puppeteer:`, error.message);
    return null;
  } finally {
    if (browser) {
      try {
        console.log(`[Micolita] [Resolver] Cerrando navegador...`);
        await browser.close();
        console.log(`[Micolita] [Resolver] Navegador cerrado correctamente.`);
      } catch (err) {
        console.error(`[Micolita] [Resolver] Error al cerrar navegador:`, err.message);
      }
    }
  }
}

// Sistema de Caché en memoria para evitar llamadas repetidas y timeouts en Stremio
const directLinkCache = new Map();
const CACHE_TTL = 3 * 60 * 60 * 1000; // Guardar los enlaces directos por 3 horas

// Map para registrar las promesas de resolución activas y evitar múltiples instancias concurrentes de Puppeteer
const activeResolutions = new Map();

async function resolveWithInternalTimeout(id, embedUrl) {
  const cached = directLinkCache.get(id);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    console.log(`[Micolita] [/play] Enlace para ${id} obtenido de caché instantáneamente.`);
    return cached.url;
  }
  
  // Si ya se está resolviendo este ID, esperar a la misma promesa
  if (activeResolutions.has(id)) {
    console.log(`[Micolita] [/play] Ya existe una resolución activa para ${id}. Esperando a que termine...`);
    return activeResolutions.get(id);
  }
  
  console.log(`[Micolita] [/play] Enlace para ${id} no está en caché. Iniciando resolución en tiempo real...`);
  
  const resolvePromise = getDirectStreamM3u8(embedUrl).then(url => {
    activeResolutions.delete(id); // Limpiar registro de resoluciones activas
    if (url) {
      directLinkCache.set(id, { url, timestamp: Date.now() });
    }
    return url;
  }).catch(err => {
    activeResolutions.delete(id); // Limpiar en caso de error
    console.error(`[Micolita] [/play] Error resolviendo en tiempo real para ${id}:`, err.message);
    return null;
  });
  
  activeResolutions.set(id, resolvePromise);
  return resolvePromise;
}

// Ruta para redireccionar y reproducir películas directamente
app.get('/play/movie/:id', async (req, res) => {
  const cleanId = req.params.id;
  const activeMirrors = await getActiveMirrors();
  if (activeMirrors.length === 0) {
    return res.status(404).send('No active mirrors found');
  }
  const primaryMirror = activeMirrors[0];
  const embedUrl = `https://${primaryMirror.domain}/embed/movie/${cleanId}?ds_lang=es`;
  
  console.log(`[Micolita] [/play/movie] Solicitud de reproducción directa para película: ${cleanId}`);
  
  const directUrl = await resolveWithInternalTimeout(cleanId, embedUrl);
  if (directUrl) {
    console.log(`[Micolita] [/play/movie] Redireccionando a enlace directo: ${directUrl}`);
    return res.redirect(302, directUrl);
  } else {
    console.log(`[Micolita] [/play/movie] Falló resolución directa. Redireccionando a embed externo como fallback.`);
    return res.redirect(302, embedUrl);
  }
});

// Ruta para redireccionar y reproducir series directamente
app.get('/play/series/:imdbId/:season/:episode', async (req, res) => {
  const { imdbId, season, episode } = req.params;
  const cleanId = `${imdbId}:${season}:${episode}`;
  const activeMirrors = await getActiveMirrors();
  if (activeMirrors.length === 0) {
    return res.status(404).send('No active mirrors found');
  }
  const primaryMirror = activeMirrors[0];
  const embedUrl = `https://${primaryMirror.domain}/embed/tv/${imdbId}/${season}-${episode}?ds_lang=es`;
  
  console.log(`[Micolita] [/play/series] Solicitud de reproducción directa para serie: ${cleanId}`);
  
  const directUrl = await resolveWithInternalTimeout(cleanId, embedUrl);
  if (directUrl) {
    console.log(`[Micolita] [/play/series] Redireccionando a enlace directo: ${directUrl}`);
    return res.redirect(302, directUrl);
  } else {
    console.log(`[Micolita] [/play/series] Falló resolución directa. Redireccionando a embed externo como fallback.`);
    return res.redirect(302, embedUrl);
  }
});

// Movie stream provider route
app.get('/stream/movie/:id.json', async (req, res) => {
  const cleanId = req.params.id.replace('.json', '');
  const activeMirrors = await getActiveMirrors();
  const streams = [];

  // Si está activada la resolución en el VPS, siempre agregamos la opción DIRECT PLAY ⭐ mediante redireccionador
  if (process.env.RESOLVE_DIRECT_LINKS === 'true' && activeMirrors.length > 0) {
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const playUrl = `${protocol}://${host}/play/movie/${cleanId}`;
    
    streams.push({
      name: `Micolita\nDIRECT PLAY ⭐`,
      type: 'url',
      title: `🎬 Reproducción Directa Nativa (TV/Chromecast)\n⚡ Servidor: VPS Contabo\n🌐 Calidad: Auto (m3u8)\n💬 Subs: Español (Auto)\n✅ Compatible con reproductor interno (Carga en ~8s)`,
      url: playUrl
    });
  }
  
  // Agregar siempre los mirrors externos tradicionales como fallback
  activeMirrors.forEach((mirror, idx) => {
    const emoji = idx === 0 ? '⭐' : '🔗';
    streams.push({
      name: `Micolita\n${mirror.label}`,
      type: 'embed',
      title: `${emoji} VsEmbed Mirror (${mirror.domain})\n🌐 Idioma: Dual/Multi (Selección interna)\n💬 Subs: Español (Auto)\n⚠️ Abre en el navegador`,
      externalUrl: `https://${mirror.domain}/embed/movie/${cleanId}?ds_lang=es`
    });
  });

  res.json({ streams });
});

// Series stream provider route
app.get('/stream/series/:id.json', async (req, res) => {
  const cleanId = req.params.id.replace('.json', '');
  
  // Format is ttXXXXXXX:season:episode
  const parts = cleanId.split(':');
  if (parts.length < 3) {
    return res.status(400).json({ error: 'Formato de ID inválido. Debe ser imdb_id:season:episode' });
  }

  const [imdbId, season, episode] = parts;
  const activeMirrors = await getActiveMirrors();
  const streams = [];

  // Si está activada la resolución en el VPS, agregamos la opción DIRECT PLAY ⭐ mediante redireccionador
  if (process.env.RESOLVE_DIRECT_LINKS === 'true' && activeMirrors.length > 0) {
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const playUrl = `${protocol}://${host}/play/series/${imdbId}/${season}/${episode}`;
    
    streams.push({
      name: `Micolita\nDIRECT PLAY ⭐`,
      type: 'url',
      title: `🎬 Reproducción Directa Nativa (TV/Chromecast)\n⚡ Servidor: VPS Contabo\n🌐 Temp. ${season} - Cap. ${episode}\n🌐 Calidad: Auto (m3u8)\n💬 Subs: Español (Auto)\n✅ Compatible con reproductor interno (Carga en ~8s)`,
      url: playUrl
    });
  }

  // Agregar siempre los mirrors externos tradicionales como fallback
  activeMirrors.forEach((mirror, idx) => {
    const emoji = idx === 0 ? '⭐' : '🔗';
    streams.push({
      name: `Micolita\n${mirror.label}`,
      type: 'embed',
      title: `${emoji} VsEmbed TV Mirror (${mirror.domain})\n🌐 Temp. ${season} - Cap. ${episode}\n🌐 Idioma: Dual/Multi (Selección interna)\n💬 Subs: Español (Auto)\n⚠️ Abre en el navegador`,
      externalUrl: `https://${mirror.domain}/embed/tv/${imdbId}/${season}-${episode}?ds_lang=es`
    });
  });

  res.json({ streams });
});

module.exports = app;
