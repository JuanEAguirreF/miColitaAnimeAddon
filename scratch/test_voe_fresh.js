const axios = require('axios');
const cheerio = require('cheerio');

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    const start = code <= 90 ? 65 : 97;
    return String.fromCharCode(((code - start + 13) % 26) + start);
  });
}

function replacePatterns(txt) {
  const patterns = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
  let result = txt;
  for (const pat of patterns) {
    result = result.split(pat).join('');
  }
  return result;
}

function safeB64Decode(s) {
  let padded = s;
  const pad = s.length % 4;
  if (pad) {
    padded += '='.repeat(4 - pad);
  }
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

function shiftChars(text, shift) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) - shift);
  }
  return out;
}

function reverseString(text) {
  return text.split('').reverse().join('');
}

function deobfuscateVoeJson(rawJson) {
  try {
    const arr = JSON.parse(rawJson);
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'string') {
      return null;
    }
    const obf = arr[0];
    const step1 = rot13(obf);
    const step2 = replacePatterns(step1);
    const step3 = safeB64Decode(step2);
    if (!step3) return null;
    const step4 = shiftChars(step3, 3);
    const step5 = reverseString(step4);
    const step6 = safeB64Decode(step5);
    if (!step6) return null;
    try {
      return JSON.parse(step6);
    } catch (e) {
      return step6;
    }
  } catch (err) {
    return null;
  }
}

async function fetchHtmlWithHeaders(url, referer) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  };
  if (referer) {
    headers.Referer = referer;
  }

  const response = await axios.get(url, {
    timeout: 10000,
    headers,
    maxRedirects: 5,
  });

  return { html: response.data, headers: response.headers };
}

async function resolveVoeUrl(url) {
  let { html } = await fetchHtmlWithHeaders(url);

  // 1. Follow JS redirect if present
  const redirectMatch = html.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
  if (redirectMatch && redirectMatch[1]) {
    const redirectRes = await fetchHtmlWithHeaders(redirectMatch[1], url);
    html = redirectRes.html;
  }

  // 2. Try Method 8: Obfuscated JSON decryption
  const jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (jsonMatch && jsonMatch[1]) {
    const decoded = deobfuscateVoeJson(jsonMatch[1].trim());
    if (decoded && typeof decoded === 'object') {
      const directUrl = decoded.source || decoded.direct_access_url;
      if (directUrl) {
        return directUrl;
      }
    }
  }
  return null;
}

async function main() {
  const embedUrl = 'https://voe.sx/e/ykizhlwsqzs8';
  try {
    const directUrl = await resolveVoeUrl(embedUrl);
    if (!directUrl) {
      console.log('Failed to resolve direct URL!');
      return;
    }
    console.log('Resolved direct URL:', directUrl);

    const scenarios = [
      { name: 'No Headers', headers: {} },
      { name: 'Referer Only', headers: { 'Referer': 'https://voe.sx/' } },
      { name: 'User-Agent Only', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } },
      { name: 'Both Referer and User-Agent', headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://voe.sx/'
      } }
    ];

    for (const s of scenarios) {
      try {
        console.log(`\n--- Scenario: ${s.name} ---`);
        const res = await axios.get(directUrl, {
          headers: s.headers,
          timeout: 5000
        });
        console.log(`Status: ${res.status}`);
        console.log(`Content-Type: ${res.headers['content-type']}`);
      } catch (e) {
        console.log(`Error: ${e.message}`);
        if (e.response) {
          console.log(`Response Status: ${e.response.status}`);
        }
      }
    }
  } catch (err) {
    console.error('Error in main:', err.message);
  }
}

main();
