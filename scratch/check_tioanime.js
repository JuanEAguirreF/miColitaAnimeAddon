const axios = require('axios');

async function checkTioAnime() {
  const url = 'https://tioanime.com/ver/rezero-kara-hajimeru-isekai-seikatsu-4th-season-8';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    console.log(`Status: ${res.status}`);
    console.log(`HTML length: ${res.data.length}`);
    console.log(`HTML snippet:\n`, res.data.substring(0, 1000));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

checkTioAnime();
