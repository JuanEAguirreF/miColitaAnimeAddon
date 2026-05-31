const tioanimeService = require('../api/scraper/tioanime.service');

async function testSearch() {
  const queries = ['Spider-Noir', 'Spider Riders', 'Spider Riders: Oracle no Yuusha-tachi'];
  for (const query of queries) {
    try {
      console.log(`\nSearching for: "${query}"`);
      const res = await tioanimeService.searchAnime(query);
      console.log('Success:', res.success);
      if (res.success && res.data && res.data.results) {
        console.log(`Found ${res.data.results.length} results:`);
        res.data.results.slice(0, 5).forEach((r, idx) => {
          console.log(`${idx + 1}. Title: "${r.title}", Slug: "${r.slug}"`);
        });
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

testSearch();
