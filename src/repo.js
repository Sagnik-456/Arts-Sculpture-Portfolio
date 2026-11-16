// Read helpers shared by public pages and admin.
const { db } = require('./db');
const { imageUrl } = require('./images');
const { workRatio, formatDims } = require('./util');

const qImagesFor = db.prepare('SELECT * FROM images WHERE work_id = ? ORDER BY sort_order, id');

function decorateImage(img) {
  return img && {
    ...img,
    sm: imageUrl(img.file, 'sm'),
    md: imageUrl(img.file, 'md'),
    lg: imageUrl(img.file, 'lg'),
  };
}

// Order of works everywhere: newest first. The top-most work of a category is its cover.
const WORK_ORDER = 'w.created_at DESC, w.id DESC';

function decorateCategory(c) {
  if (!c) return null;
  const img = db.prepare(`
    SELECT i.* FROM images i JOIN works w ON w.id = i.work_id
    WHERE w.category_id = ? AND w.published = 1
    ORDER BY ${WORK_ORDER}, i.sort_order, i.id LIMIT 1`).get(c.id);
  return { ...c, cover: decorateImage(img), url: `/category/${c.slug}` };
}

function decorateWork(w, category) {
  if (!w) return null;
  const images = qImagesFor.all(w.id).map(decorateImage);
  const cat = category !== undefined ? category
    : (w.category_id ? db.prepare('SELECT * FROM categories WHERE id = ?').get(w.category_id) : null);
  const cover = images[0] || null;
  return {
    ...w,
    images,
    cover,
    category: cat,
    url: `/work/${w.slug}`,
    // Images always keep their own proportions on cards (no cropping, no size overrides).
    ratio: workRatio({ display_ratio: 'original' }, cat, cover),
    display_fit: 'cover',
    display_size: 'normal',
    dims: formatDims(w),
  };
}

function categories({ includeHidden = false } = {}) {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM works w WHERE w.category_id = c.id AND w.published = 1) AS work_count
    FROM categories c ${includeHidden ? '' : 'WHERE c.visible = 1'}
    ORDER BY c.sort_order, c.id`).all();
  return rows.map(decorateCategory);
}

function categoryBySlug(slug) {
  return decorateCategory(db.prepare('SELECT * FROM categories WHERE slug = ? AND visible = 1').get(slug));
}

function worksInCategory(catId, { limit = 500, includeUnpublished = false } = {}) {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(catId);
  return db.prepare(`
    SELECT * FROM works w WHERE category_id = ? ${includeUnpublished ? '' : 'AND published = 1'}
    ORDER BY ${WORK_ORDER} LIMIT ?`).all(catId, limit).map((w) => decorateWork(w, cat));
}

function commissionWorks(limit = 12) {
  return db.prepare(`
    SELECT w.* FROM works w LEFT JOIN categories c ON c.id = w.category_id
    WHERE w.published = 1 AND w.commission = 1 AND (c.visible = 1 OR c.id IS NULL)
    ORDER BY ${WORK_ORDER} LIMIT ?`).all(limit).map((w) => decorateWork(w));
}

function latestWorks(limit = 12) {
  return db.prepare(`
    SELECT w.* FROM works w LEFT JOIN categories c ON c.id = w.category_id
    WHERE w.published = 1 AND (c.visible = 1 OR c.id IS NULL)
    ORDER BY ${WORK_ORDER} LIMIT ?`).all(limit).map((w) => decorateWork(w));
}

function workBySlug(slug) {
  return decorateWork(db.prepare('SELECT * FROM works WHERE slug = ? AND published = 1').get(slug));
}

function workById(id) {
  return decorateWork(db.prepare('SELECT * FROM works WHERE id = ?').get(id));
}

function searchWorks(q, limit = 60) {
  const like = `%${String(q).replace(/[%_]/g, '')}%`;
  return db.prepare(`
    SELECT w.* FROM works w LEFT JOIN categories c ON c.id = w.category_id
    WHERE w.published = 1 AND (c.visible = 1 OR c.id IS NULL)
      AND (w.title LIKE ? OR w.medium LIKE ? OR w.description LIKE ? OR w.year LIKE ? OR c.name LIKE ?)
    ORDER BY ${WORK_ORDER} LIMIT ?`).all(like, like, like, like, like, limit).map((w) => decorateWork(w));
}

module.exports = {
  decorateImage, decorateCategory, decorateWork,
  categories, categoryBySlug, worksInCategory, commissionWorks, latestWorks, workBySlug, workById, searchWorks,
};
