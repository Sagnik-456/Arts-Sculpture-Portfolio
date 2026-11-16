const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'portfolio.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cover_image TEXT,               -- file base name of an uploaded cover (optional)
  accent TEXT DEFAULT '',         -- optional hex colour for the tile
  card_ratio TEXT DEFAULT 'portrait', -- default card shape for works in this category
  sort_order INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  medium TEXT DEFAULT '',
  year TEXT DEFAULT '',
  dim_w REAL, dim_h REAL, dim_d REAL,
  dim_unit TEXT DEFAULT 'cm',
  display_ratio TEXT DEFAULT 'inherit', -- inherit | square | portrait | landscape | wide | tall | original
  display_fit TEXT DEFAULT 'cover',     -- cover | contain
  display_size TEXT DEFAULT 'normal',   -- normal | wide | tall | large  (grid span on category page)
  max_width INTEGER DEFAULT 2000,       -- longest edge of the stored large image
  description TEXT DEFAULT '',
  essay TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  file TEXT NOT NULL,     -- base name; variants: <file>-lg.webp, -md.webp, -sm.webp
  width INTEGER, height INTEGER,
  caption TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  work_id INTEGER REFERENCES works(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_works_cat ON works(category_id);
CREATE INDEX IF NOT EXISTS idx_images_work ON images(work_id);
`);

// ---------- migrations ----------
const workCols = db.prepare('PRAGMA table_info(works)').all().map((c) => c.name);
if (!workCols.includes('commission')) {
  // "Commission" replaces the old "featured" flag: works made as commissions, shown in the home Commissions section.
  db.exec('ALTER TABLE works ADD COLUMN commission INTEGER DEFAULT 0');
}

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  artist_name: 'Chirag',
  artist_role: 'Impressionist painter, sculptor & ceramic artist',
  hero_title: 'Light, water & clay — caught mid-breath.',
  hero_subtitle: 'An evolving portfolio of watercolours, drawings, sculpture and fired earth.',
  hero_work_id: '',
  statement: 'I paint the moment before it settles — the shiver of light on water, the weight of a storm that has not yet broken. Whether in pigment or in clay, I chase the impression, not the inventory.',
  bio: 'Working between the studio and the open air, the artist moves freely across watercolour, drawing, bronze, ceramic and terracotta. Each medium is approached with the same impressionist instinct: loose, honest and attentive to light.',
  cv_exhibitions: '2025 | Solo show — "Wet on Wet", City Art Gallery\n2024 | Group show — "Earth & Fire", Contemporary Ceramics Fair\n2023 | Annual Watercolour Salon — selected artist',
  cv_education: '2016 – 2020 | B.F.A. in Painting, College of Art',
  cv_awards: '2024 | Juror\'s Mention, National Watercolour Exhibition',
  contact_email: 'hello@example.com',
  contact_phone: '',
  contact_location: 'Studio visits by appointment',
  instagram: '',
  commission_note: 'Open to commissions, exhibitions and collaborations. Tell me which work caught your eye.',
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (getSetting.get(k) === undefined) putSetting.run(k, v);
}

function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function saveSettings(obj) {
  const tx = db.transaction((o) => {
    for (const [k, v] of Object.entries(o)) {
      if (k in DEFAULT_SETTINGS) putSetting.run(k, v == null ? '' : String(v));
    }
  });
  tx(obj);
}

// ---------- default categories ----------
const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (catCount === 0) {
  const ins = db.prepare('INSERT INTO categories (name, slug, tagline, card_ratio, sort_order) VALUES (?, ?, ?, ?, ?)');
  [
    ['Drawings & Sketches', 'drawings-sketches', 'Graphite, ink & charcoal', 'portrait', 1],
    ['Paintings', 'paintings', 'Watercolour & mixed media', 'landscape', 2],
    ['Sculptures', 'sculptures', 'Bronze, clay & stone', 'portrait', 3],
    ['Ceramics', 'ceramics', 'Glazed & fired forms', 'square', 4],
    ['Pottery & Terracotta', 'pottery-terracotta', 'Earthenware from the wheel', 'square', 5],
  ].forEach((c) => ins.run(...c));
}

module.exports = { db, allSettings, saveSettings, DATA_DIR, DEFAULT_SETTINGS };
