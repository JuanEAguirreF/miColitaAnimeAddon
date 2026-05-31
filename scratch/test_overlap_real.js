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

function findSlugInProvider(results, animeName) {
  const targetClean = cleanName(animeName);
  console.log(`\nTesting matching for target: "${animeName}" (cleaned: "${targetClean}")`);

  // 1. Check exact match
  for (const res of results) {
    if (cleanName(res.title) === targetClean) {
      console.log(`- Step 1 Match: "${res.title}" -> "${res.slug}"`);
      return res.slug;
    }
  }

  // 2. Check fuzzy match (includes)
  for (const res of results) {
    const cleanResTitle = cleanName(res.title);
    if (cleanResTitle.includes(targetClean) || targetClean.includes(cleanResTitle)) {
      console.log(`- Step 2 Match: "${res.title}" -> "${res.slug}"`);
      return res.slug;
    }
  }

  // 3. Check token overlap (shares at least 50% of significant non-stop words)
  const STOP_WORDS = new Set(['in', 'of', 'the', 'a', 'to', 'and', 'for', 'at', 'by', 'an', 'el', 'la', 'de', 'con', 'un', 'del', 'los', 'las', 'y', 'o', 'u', 'en', 'para', 'por', 'que']);
  const targetWords = targetClean.split(' ').filter(w => w && !STOP_WORDS.has(w));
  console.log(`Target Words:`, targetWords);

  if (targetWords.length > 0) {
    for (const res of results) {
      const cleanResTitle = cleanName(res.title);
      const resWords = cleanResTitle.split(' ').filter(w => w && !STOP_WORDS.has(w));
      const overlapCount = targetWords.filter(w => resWords.includes(w)).length;
      const ratio = overlapCount / targetWords.length;
      if (ratio >= 0.5) {
        console.log(`- Step 3 Match: "${res.title}" -> "${res.slug}"`);
        return res.slug;
      }
    }
  }
  return null;
}

const mockResults = [
  { title: "Dandelion", slug: "dandelion" },
  { title: "Aishiteru Game wo Owarasetai", slug: "aishiteru-game-wo-owarasetai" },
  { title: "Tsue to Tsurugi no Wistoria Season 2", slug: "tsue-to-tsurugi-no-wistoria-season-2" },
  { title: "Yozakura-san Chi no Daisakusen 2nd Season", slug: "yozakurasan-chi-no-daisakusen-2nd-season" },
  { title: "Kuroneko to Majo no Kyoushitsu", slug: "kuroneko-to-majo-no-kyoushitsu" },
  { title: "Yowayowa Sensei", slug: "yowayowa-sensei" },
  { title: "Ichijouma Mankitsugurashi!", slug: "ichijouma-mankitsugurashi" },
  { title: "Kill Ao", slug: "kill-ao" },
  { title: "Hokuto no Ken: Fist of the North Star", slug: "hokuto-no-ken-fist-of-the-north-star" },
  { title: "Kamiina Botan, Yoeru Sugata wa Yuri no Hana", slug: "kamiina-botan-yoeru-sugata-wa-yuri-no-hana" },
  { title: "Kami no Shizuku", slug: "kami-no-shizuku" },
  { title: "Awajima Hyakkei", slug: "awajima-hyakkei" },
  { title: "Marika-chan no Koukando wa Bukkowareteiru", slug: "marikachan-no-koukando-wa-bukkowareteiru" },
  { title: "Himekishi wa Barbaroi no Yome", slug: "himekishi-wa-barbaroi-no-yome" },
  { title: "Kujima Utaeba Ie Hororo", slug: "kujima-utaeba-ie-hororo" },
  { title: "Otaku ni Yasashii Gal wa Inai!?", slug: "otaku-ni-yasashii-gal-wa-inai" },
  { title: "Kanojo, Okarishimasu 5th Season", slug: "kanojo-okarishimasu-5th-season" },
  { title: "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season", slug: "rezero-kara-hajimeru-isekai-seikatsu-4th-season" },
  { title: "Marriagetoxin", slug: "marriagetoxin" },
  { title: "Tadaima, Ojamasaremasu!", slug: "tadaima-ojamasaremasu" }
];

findSlugInProvider(mockResults, "Spider Riders");
findSlugInProvider(mockResults, "Spider Riders: Oracle no Yuusha-tachi");
