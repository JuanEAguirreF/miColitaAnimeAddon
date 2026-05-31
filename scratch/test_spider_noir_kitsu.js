const axios = require('../node_modules/axios');

async function getAlternativeTitlesFromKitsu(name) {
  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(name)}`;
    console.log(`Querying Kitsu for: "${name}"`);
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
      
      return [...new Set(titles)];
    }
  } catch (err) {
    console.error('Error fetching Kitsu titles:', err.message);
  }
  return [];
}

async function test() {
  const name = 'Spider-Noir';
  const alternativeTitles = await getAlternativeTitlesFromKitsu(name);
  console.log('\nAlternative Titles for Spider-Noir:', alternativeTitles);
}

test();
