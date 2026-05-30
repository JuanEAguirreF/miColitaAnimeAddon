# miColita Anime - Stremio Addon

**miColita Anime** es un addon de Stremio premium, rápido y ligero, diseñado específicamente para la comunidad hispanohablante. Integra en cascada 5 de los mejores proveedores de anime en español (**AnimeFLV**, **TioAnime**, **MonosChinos**, **AnimeAV1** y **JKAnime**) para ofrecer enlaces estables y organizados en audio original con subtítulos (SUB) o con doblaje al español Latino/Castellano (DUB).

---

## 🌟 Características de miColita Anime

- **Multi-Proveedor Integrado:** Búsqueda y resolución automática en cascada. Si un servidor o proveedor falla, el addon consulta el siguiente de manera inteligente.
- **Detección Inteligente SUB/DUB:** Los streams se dividen y etiquetan de forma clara dentro de Stremio, permitiendo elegir entre la versión subtitulada o doblada.
- **Resolución Veloz:** Sistema optimizado de caché distribuida en memoria (TTL de 24 horas para metadatos y 3 horas para streams) que permite cargas instantáneas en menos de 1 segundo.
- **Mapeo Universal de IDs:** Traduce automáticamente IDs de Cinemeta (IMDb `ttXXXXXX`) o del catálogo de Kitsu (`kitsu:XXXX`) a títulos de anime y episodios correctos.
- **Página de Inicio Premium:** Interfaz web interactiva con estética de anime, modo oscuro inmersivo, efecto de cristal (glassmorphism), botón de instalación directa e indicador dinámico del manifest.
- **Listo para Vercel:** Estructura nativa compatible con despliegues serverless gratuitos.

---

## 🛠️ Cómo ejecutar de forma Local (En tu PC)

### Prerrequisitos
Debes tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior).

### Pasos
1. Abre tu terminal en la carpeta del proyecto.
2. Instala las dependencias del proyecto ejecutando:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo local con:
   ```bash
   npm start
   ```
4. Verás el siguiente mensaje en tu consola:
   ```text
   🚀 Addon miColita Anime corriendo en el puerto 7000
   Página de Inicio: http://localhost:7000/
   Manifest URL:    http://localhost:7000/manifest.json
   ```

### Instalar en Stremio Localmente
1. Abre tu navegador e ingresa a `http://localhost:7000/`.
2. Haz clic en el botón **"Instalar en Stremio"**. Esto abrirá la app de Stremio y cargará el addon para confirmar su instalación.

---

## ☁️ Cómo publicar GRATIS en Vercel

Vercel es ideal para alojar este addon de forma gratuita, estable y de por vida.

### Método Recomendado (Usando GitHub)
1. Sube este proyecto a tu repositorio personal de GitHub.
2. Ve a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
3. Haz clic en **"Add New..." -> "Project"**.
4. Importa el repositorio de tu addon y haz clic en **"Deploy"**.
5. ¡Listo! Vercel te dará una URL pública gratuita como `https://micolita-anime-stremio.vercel.app`.

---

## 📁 Estructura del Código

- `api/index.js`: El corazón del addon. Maneja las rutas Stremio (`/manifest.json`, `/stream/:type/:id.json`), la página de inicio y coordina la búsqueda y el caché.
- `api/scraper/`: Contiene los resolvedores individuales para cada proveedor (AnimeFLV, TioAnime, AnimeAV1, MonosChinos, JKAnime y HentaiLA) importados del motor open-source `anime1v-api` de FxxMorgan.
- `api/utils/api-error.js`: Clase estándar para el manejo de errores HTTP y registro de firmas de licencia.
- `index.js`: El arrancador local para desarrollo rápido en PC (`npm start`).
- `vercel.json`: Configura las rutas para el procesamiento serverless de Node.js en la plataforma Vercel.

---

¡Disfruta de tus animes favoritos con **miColita Anime**! 🌸🔥
