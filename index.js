const app = require('./api/index.js');
const PORT = process.env.PORT || 7000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Addon miColita Anime corriendo en el puerto ${PORT}`);
  console.log(`====================================================`);
  console.log(`Página de Inicio: http://localhost:${PORT}/`);
  console.log(`Manifest URL:    http://localhost:${PORT}/manifest.json`);
  console.log(`====================================================`);
  console.log(`Presiona Ctrl+C para detener el servidor.`);
});
