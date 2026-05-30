# Micolita - Stremio Addon

Micolita es un addon de Stremio premium y ligero, diseñado para proporcionar enlaces de reproducción para películas y series usando la API de `vsembed.ru` (y sus múltiples mirrors). Cuenta con soporte automático para subtítulos en español (`es`) y está completamente configurado para ser desplegado gratis en **Vercel** o ejecutarse localmente.

---

## 🌟 Características de Micolita

- **4 Servidores Mirror Simultáneos:** Para garantizar máxima disponibilidad y evitar caídas (`vidsrc-embed.ru`, `vidsrc-embed.su`, `vidsrcme.su`, `vsrc.su`).
- **Subtítulos en Español Activos por Defecto:** Inyecta automáticamente el parámetro `ds_lang=es` en el reproductor para cargar subtítulos en español.
- **Multilenguaje/Doble Audio:** Si el video original cuenta con pistas de doblaje o audios duales, podrás alternarlos directamente desde los controles del reproductor.
- **Página de Inicio Premium:** Interfaz web moderna con estilo dark mode y glassmorphic, que incluye un botón de instalación directa e indicador dinámico de tu manifest.
- **Despliegue Gratis e Instantáneo en Vercel:** Estructura adaptada para correr de forma nativa como función serverless.

---

## 🛠️ Cómo ejecutar de forma Local (En tu PC)

Si quieres usar el addon de forma personal en tu computadora, sigue estos pasos:

### Prerrequisitos
Debes tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior).

### Pasos
1. Abre tu terminal en la carpeta del proyecto (`d:\Proyectos\vidAddPersonal`).
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
   🚀 Addon Micolita corriendo localmente en el puerto 7000
   Página de Inicio: http://localhost:7000/
   Manifest URL:    http://localhost:7000/manifest.json
   ```

### Instalar en Stremio Localmente
1. Abre tu navegador e ingresa a `http://localhost:7000/`.
2. Haz clic en el botón morado **"Instalar en Stremio"**. Esto abrirá la app de Stremio instalada en tu sistema y te pedirá confirmar la instalación.
3. Alternativamente, puedes copiar la dirección del manifest (`http://localhost:7000/manifest.json`), abrir Stremio, ir a la sección de **Addons**, pegarlo en la barra de búsqueda superior y hacer clic en **Instalar**.

---

## ☁️ Cómo publicar GRATIS en Vercel (En 1 minuto)

Para poder usar Micolita en tu Smart TV, teléfono móvil, o compartirlo con amigos, necesitas subirlo a internet. Vercel es la plataforma ideal y ofrece alojamiento gratuito de por vida para proyectos de este tamaño.

### Opción A: Usando la terminal (Vercel CLI)
1. Instala el CLI de Vercel de forma global si no lo tienes:
   ```bash
   npm install -g vercel
   ```
2. Ejecuta el comando de despliegue en la carpeta del proyecto:
   ```bash
   vercel
   ```
3. Responde a las preguntas de la terminal (puedes presionar Enter en todas las opciones por defecto).
4. ¡Listo! Vercel te dará una URL pública como `https://micolita-stremio.vercel.app`.
5. Abre esa URL en tu navegador para ver la página web de tu addon y haz clic en **Instalar en Stremio**.

### Opción B: Usando GitHub (Súper recomendado)
1. Sube este proyecto a tu cuenta personal de GitHub en un repositorio nuevo.
2. Entra a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
3. Haz clic en **"Add New..."** -> **"Project"**.
4. Importa el repositorio de GitHub que acabas de subir.
5. Haz clic en **"Deploy"**. Vercel se encargará de compilar y desplegar todo automáticamente en segundos y te dará tu URL pública de forma gratuita. Cada vez que actualices el repositorio de GitHub, tu addon se actualizará solo.

---

## 📁 Estructura del Código

- `api/index.js`: El corazón del addon. Define la API de Stremio (`/manifest.json`, `/stream/movie/:id.json`, `/stream/series/:id.json`) y sirve la página de inicio interactiva.
- `index.js`: El arrancador local para cuando lo corres en tu PC (`npm start`).
- `vercel.json`: Archivo de configuración que le dice a Vercel que procese las peticiones usando funciones serverless Node.js.
- `package.json`: Definición del proyecto Node.js, dependencias y scripts de inicio.

---

¡Disfruta de tus películas y series favoritas con **Micolita**! 🎬🍿
