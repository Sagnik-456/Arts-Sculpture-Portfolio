// Loads the sample artworks from /seed-images so the site has content to show.
// Safe to run once; it skips if works already exist (use --force to add anyway).
// All titles and texts are PLACEHOLDERS — edit them in the admin panel.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { db } = require('../src/db');
const { processImage } = require('../src/images');
const { uniqueSlug } = require('../src/util');

const SEED_DIR = path.join(__dirname, '..', 'seed-images');

const WORKS = [
  { file: '1.jpg', cat: 'paintings', title: 'The Garden Bridge', medium: 'Watercolour on cotton paper', featured: 1,
    crop: { left: 40, top: 175, width: 1100, height: 555 },
    description: 'A stone bridge dissolving into summer greens — painted wet-into-wet so the foliage could bloom on its own.',
    essay: '## On letting water lead\n\nThis painting began with almost no drawing at all. The paper was soaked, the greens dropped in, and for the first ten minutes the water did most of the work.\n\n> The bridge is the only thing in the picture I insisted on.\n\nEverything else — the reflections, the light breaking through the trees — I allowed to settle where it wanted. *Replace this sample essay from the admin panel.*' },
  { file: '3.jpg', cat: 'paintings', title: 'Mustard Valley', medium: 'Watercolour on paper', featured: 1,
    description: 'Mist rolling off the hills onto a field of yellow; bare trees written in a few quick strokes.' },
  { file: '8.jpg', cat: 'paintings', title: 'Evening Swim', medium: 'Watercolour on paper', featured: 1, display_ratio: 'landscape',
    description: 'The last orange light over a quiet bay, boats at rest and swimmers lingering in the warm water.' },
  { file: '2.jpg', cat: 'paintings', title: 'Before the Rain', medium: 'Watercolour on paper',
    description: 'A country path under a heavy, moving sky — painted outdoors before the weather turned.' },
  { file: '9.jpg', cat: 'paintings', title: 'Ember Studies I–IV', medium: 'Watercolour on handmade paper', display_ratio: 'tall',
    description: 'Four small horizons in burnt sienna and rose, exploring how far a landscape can be reduced.' },
  { file: '4.jpg', cat: 'sculptures', title: 'The Gathering', medium: 'Hand-built unglazed clay', featured: 1,
    description: 'Seven figures standing close, each surface combed and scored by hand.' },
  { file: '6.jpg', cat: 'sculptures', title: 'The Catch', medium: 'Bronze on wooden base',
    description: 'A fisherman carrying a fish larger than himself — a small comedy cast in bronze.' },
  { file: '7.jpg', cat: 'sculptures', title: 'Family of Deer', medium: 'Bronze, verdigris patina', display_ratio: 'square',
    description: 'A doe, a fawn and a resting hind folded into one quiet, interlocking form.' },
  { file: '5.jpg', cat: 'ceramics', title: 'Keeper of Cherries', medium: 'Glazed stoneware', featured: 1,
    crop: { left: 0, top: 185, width: 640, height: 765 },
    description: 'A blue creature balancing a footed bowl on its back — functional, playful and slightly mysterious.' },
];

(async () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
  if (count > 0 && !process.argv.includes('--force')) {
    console.log(`There are already ${count} works. Nothing seeded (use "npm run seed -- --force" to add samples anyway).`);
    return;
  }
  const catId = (slug) => (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) || {}).id || null;
  let order = 0;
  for (const w of WORKS) {
    const src = path.join(SEED_DIR, w.file);
    if (!fs.existsSync(src)) { console.warn('missing', src); continue; }
    let buf = fs.readFileSync(src);
    if (w.crop) buf = await sharp(buf).extract(w.crop).jpeg({ quality: 95 }).toBuffer();
    const img = await processImage(buf, { maxWidth: 2000 });
    const id = db.prepare(`INSERT INTO works (category_id, title, slug, medium, display_ratio, description, essay, featured, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      catId(w.cat), w.title, uniqueSlug(db, 'works', w.title), w.medium, w.display_ratio || 'inherit',
      w.description, w.essay || '', w.featured || 0, order++,
    ).lastInsertRowid;
    db.prepare('INSERT INTO images (work_id, file, width, height, sort_order) VALUES (?, ?, ?, ?, 0)').run(id, img.file, img.width, img.height);
    console.log('seeded', w.title);
  }
  const hero = db.prepare("SELECT id FROM works WHERE title = 'The Garden Bridge'").get();
  if (hero) db.prepare("UPDATE settings SET value = ? WHERE key = 'hero_work_id'").run(String(hero.id));
})();
