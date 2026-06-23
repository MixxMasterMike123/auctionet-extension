#!/usr/bin/env node
// Pre-seed the spellcheck whitelist with known-good Swedish auction vocabulary.
//
// Words are extracted from the extension's curated lists (brands, auction
// terms, materials, period/style descriptors, safe words). Seeding them as
// 'active' means LanguageTool's false positives on these obscure-but-valid
// words never surface — the team only adjudicates the genuine long tail.
//
// Usage:
//   node seed.mjs https://auctionet-spellcheck.<sub>.workers.dev
//   node seed.mjs <url> --dry-run        # print the word list, don't POST
//
// Idempotent: re-running is safe. seed:true never clobbers a word a human
// already promoted/rejected; it only fills in new ones as 'active'.

// ─── Curated source words (from the extension's modules) ────────────────────
// brand names (split into component words below), auction terms, materials,
// colors, conditions, periods, descriptors, and known safe words.
const RAW = {
  brands: [
    'Lemania', 'Omega', 'Rolex', 'Patek Philippe', 'Vacheron Constantin',
    'Orrefors', 'Kosta Boda', 'Iittala', 'Nuutajärvi',
    'Gustavsberg', 'Rörstrand', 'Arabia', 'Royal Copenhagen', 'Bing & Grøndahl',
    'Svenskt Tenn', 'Källemo', 'Lammhults', 'Hermès', 'Louis Vuitton', 'Cartier',
  ],
  auctionTerms: [
    'akvarell', 'antik', 'berlocker', 'blå', 'briljant', 'bruttovikt', 'budgivning',
    'collier', 'daterad', 'diamanter', 'diameter', 'estimat', 'etsning', 'exemplar',
    'fläckar', 'förgylld', 'försäljning', 'granit', 'grön', 'gul', 'guld', 'halsband',
    'handmålad', 'höjd', 'katalog', 'klubbslag', 'kollektion', 'koppar', 'kristall',
    'litografi', 'längd', 'marmor', 'märkt', 'mässing', 'målning', 'möbler', 'nagg',
    'oljemålning', 'oxiderad', 'polstring', 'porslin', 'provenienser', 'repor', 'röd',
    'sekel', 'signerad', 'silver', 'skador', 'skulptur', 'slitage', 'smycken',
    'sprickor', 'stoppning', 'svart', 'tillverkad', 'uppsättning', 'ursprung',
    'utropspris', 'vikt', 'vintage', 'vit', 'århundrade', 'örhänge',
    'nettovikt', 'armband', 'ungefär',
  ],
  safeWords: [
    'anlupet', 'anlupning', 'anlöpning', 'boett', 'bultlås', 'delvist',
    'funktionstestad', 'funktionstesterad', 'glasservis', 'kaffeservis', 'karott',
    'pendyl', 'plymå', 'porslinsservis', 'röllakan', 'serveringsfat', 'serveringsskål',
    'smide', 'stramalj', 'tablå', 'teservis', 'chiffonjé',
  ],
  // Period / style / origin descriptors — the obscure ones LanguageTool flags.
  descriptors: [
    'art deco', 'art nouveau', 'barock', 'benporslin', 'bidjar', 'biedermeier',
    'chippendale', 'empire', 'fajans', 'gabbeh', 'gustaviansk', 'heriz',
    'hårdporslin', 'isfahan', 'jugend', 'kashan', 'kilim', 'lergods', 'mjukporslin',
    'nain', 'neoklassisk', 'qom', 'rokoko', 'sheraton', 'stengods', 'tabriz',
    'orientalisk', 'persisk', 'handknuten', 'handvävd',
  ],
};

// ─── Normalize into a flat, deduped, valid word list ────────────────────────
// The Worker accepts single letter-ish tokens (^\p{L}[\p{L}\-'.]*$). Multi-word
// brands get split into component words; junk tokens (&, 1-char, pure numbers)
// are dropped.
function toWords(list) {
  const out = [];
  for (const entry of list) {
    for (const tok of String(entry).split(/[\s/]+/)) {
      const w = tok.trim().toLowerCase();
      if (w.length < 2) continue;                 // drop single chars (&, etc.)
      if (!/^[\p{L}][\p{L}\-'.]*$/u.test(w)) continue; // Worker's validation
      out.push(w);
    }
  }
  return out;
}

const words = Array.from(new Set([
  ...toWords(RAW.brands),
  ...toWords(RAW.auctionTerms),
  ...toWords(RAW.safeWords),
  ...toWords(RAW.descriptors),
])).sort((a, b) => a.localeCompare(b, 'sv'));

// ─── Run ────────────────────────────────────────────────────────────────────
const base = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!base || !base.startsWith('http')) {
  console.error('Usage: node seed.mjs <worker-url> [--dry-run]');
  process.exit(1);
}

console.log(`${words.length} unique words to seed:\n`);
console.log(words.join(', '));

if (dryRun) {
  console.log('\n--dry-run: nothing posted.');
  process.exit(0);
}

const url = `${base.replace(/\/$/, '')}/whitelist`;
let ok = 0, fail = 0;
const failed = [];
console.log(`\nPosting to ${url} …\n`);

// The Worker rate-limits writes to ~120/min/IP. Pace at ~2 req/s (550ms) to
// stay comfortably under it, and retry a rate-limited word once after a pause.
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postWord(word) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, seed: true, added_by: 'seed-script' }),
  });
  return r.status;
}

for (const word of words) {
  let status;
  try { status = await postWord(word); } catch { status = 0; }
  if (status === 429) {                 // rate limited — wait out the window, retry once
    process.stdout.write('~');
    await sleep(60_000);
    try { status = await postWord(word); } catch { status = 0; }
  }
  if (status >= 200 && status < 300) { ok++; process.stdout.write('.'); }
  else { fail++; failed.push(word); process.stdout.write('x'); }
  await sleep(550);
}

console.log(`\n\nDone: ${ok} seeded, ${fail} failed.`);
if (failed.length) console.log('Failed words:', failed.join(', '));
