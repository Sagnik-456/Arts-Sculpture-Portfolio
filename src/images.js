const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
// Full-resolution originals are kept privately (not web-served) so display sizes can be regenerated.
const ORIG_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'originals');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ORIG_DIR, { recursive: true });

const VARIANTS = { sm: 560, md: 1100 }; // lg uses the work's max_width setting

/**
 * Process an uploaded image buffer into webp variants.
 * Returns { file, width, height } where width/height are of the large variant.
 * Throws if the buffer is not a decodable image.
 */
async function processImage(buffer, { maxWidth = 2000, base = null } = {}) {
  const isNew = !base;
  base = base || crypto.randomBytes(9).toString('hex');
  const src = sharp(buffer, { failOn: 'error' }).rotate(); // honour EXIF orientation
  const meta = await src.metadata();
  if (!meta.width || !meta.height) throw new Error('Not a valid image');

  const lgEdge = Math.max(400, Math.min(Number(maxWidth) || 2000, 4000));
  const lg = await src.clone()
    .resize({ width: lgEdge, height: lgEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(UPLOAD_DIR, `${base}-lg.webp`));

  for (const [name, edge] of Object.entries(VARIANTS)) {
    await src.clone()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOAD_DIR, `${base}-${name}.webp`));
  }
  if (isNew) fs.writeFileSync(path.join(ORIG_DIR, base), buffer);
  return { file: base, width: lg.width, height: lg.height };
}

/** Re-render the display variants of an existing image at a new max size (uses the private original). */
async function reprocessImage(base, maxWidth) {
  const orig = path.join(ORIG_DIR, base);
  if (!/^[a-f0-9]+$/.test(base) || !fs.existsSync(orig)) return null;
  return processImage(fs.readFileSync(orig), { maxWidth, base });
}

function removeImageFiles(base) {
  if (!base || !/^[a-f0-9]+$/.test(base)) return;
  for (const v of ['lg', 'md', 'sm']) {
    fs.rm(path.join(UPLOAD_DIR, `${base}-${v}.webp`), { force: true }, () => {});
  }
  fs.rm(path.join(ORIG_DIR, base), { force: true }, () => {});
}

function imageUrl(base, size = 'md') {
  return base ? `/uploads/${base}-${size}.webp` : null;
}

module.exports = { processImage, reprocessImage, removeImageFiles, imageUrl, UPLOAD_DIR };
