const crypto = require('crypto');

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function uniqueSlug(db, table, base, excludeId = null) {
  let slug = slugify(base);
  let n = 1;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`);
  while (stmt.get(slug, excludeId)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Safe, tiny text formatter for descriptions & essays.
 * Blank line = new paragraph, "## " = heading, "> " = pull quote,
 * **bold**, *italic*. Everything is HTML-escaped first.
 */
function formatText(text) {
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((raw) => {
    const b = raw.trim();
    if (!b) return '';
    const inline = (s) => escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    if (b.startsWith('## ')) return `<h3>${inline(b.slice(3))}</h3>`;
    if (b.startsWith('> ')) return `<blockquote>${inline(b.replace(/^> ?/gm, ''))}</blockquote>`;
    return `<p>${inline(b)}</p>`;
  }).join('\n');
}

/** Parse "2024 | Something" lines into [{when, what}] */
function parseCvLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf('|');
    return i === -1 ? { when: '', what: l } : { when: l.slice(0, i).trim(), what: l.slice(i + 1).trim() };
  });
}

const RATIOS = {
  square: '1 / 1', portrait: '4 / 5', landscape: '4 / 3', wide: '16 / 9', tall: '2 / 3',
};
/** CSS aspect-ratio string for a work (falls back to category default, then image's own ratio). */
function workRatio(work, category, image) {
  let r = work.display_ratio && work.display_ratio !== 'inherit' ? work.display_ratio : (category && category.card_ratio) || 'portrait';
  if (r === 'original') return image && image.width ? `${image.width} / ${image.height}` : RATIOS.portrait;
  return RATIOS[r] || RATIOS.portrait;
}

function formatDims(w) {
  const parts = [w.dim_h, w.dim_w, w.dim_d].filter((x) => x !== null && x !== undefined && x !== '');
  if (!parts.length) return '';
  const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(1));
  return `${parts.map(fmt).join(' × ')} ${w.dim_unit || 'cm'}`;
}

// ---------- CSRF ----------
// csrfToken: issue a per-session token and expose it to templates (app-wide).
function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(18).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}
// csrfVerify: must run AFTER the body (urlencoded or multipart) is parsed.
function csrfVerify(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
    const expected = req.session && req.session.csrf;
    if (!token || !expected || token.length !== expected.length
      || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return res.status(403).send('Your session expired. Please go back, refresh the page and try again.');
    }
  }
  next();
}

// ---------- tiny in-memory rate limiter ----------
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).send('Too many attempts. Please wait a few minutes and try again.');
    }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    next();
  };
}

module.exports = { slugify, uniqueSlug, escapeHtml, formatText, parseCvLines, workRatio, formatDims, csrfToken, csrfVerify, rateLimit, RATIOS };
