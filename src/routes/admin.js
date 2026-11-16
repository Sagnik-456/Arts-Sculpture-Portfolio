const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, allSettings, saveSettings, DEFAULT_SETTINGS } = require('../db');
const repo = require('../repo');
const { processImage, removeImageFiles } = require('../images');
const { uniqueSlug, csrfVerify, rateLimit } = require('../util');

const router = express.Router();

// Bootstrap an admin from env vars if none exists yet (handy on hosts without a shell).
if (!db.prepare('SELECT id FROM admin LIMIT 1').get() && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)')
    .run(process.env.ADMIN_USERNAME.trim(), bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
  console.log(`Admin user "${process.env.ADMIN_USERNAME}" created from environment variables.`);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// Parse multipart (if any) before CSRF verification, for every admin request.
router.use(upload.any());
router.use(csrfVerify);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.locals.adminPath = req.path; next(); });

const flash = (req, type, text) => { req.session.flash = { type, text }; };
const filesFor = (req, field) => (req.files || []).filter((f) => f.fieldname === field);
const int = (v, d = 0) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);

// ---------------- auth ----------------
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const hasAdmin = Boolean(db.prepare('SELECT id FROM admin LIMIT 1').get());
  res.render('admin/login', { title: 'Sign in', error: null, hasAdmin });
});

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const { username = '', password = '' } = req.body;
  const user = db.prepare('SELECT * FROM admin WHERE username = ?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).render('admin/login', { title: 'Sign in', error: 'Incorrect username or password.', hasAdmin: true });
  }
  req.session.adminId = user.id;
  req.session.csrf = null; // rotate token on login
  res.redirect('/admin');
});

router.post('/logout', (req, res) => { req.session = null; res.redirect('/'); });

router.use((req, res, next) => {
  if (!req.session.adminId || !db.prepare('SELECT id FROM admin WHERE id = ?').get(req.session.adminId)) {
    req.session.adminId = null;
    return res.redirect('/admin/login');
  }
  res.locals.unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get().n;
  next();
});

// ---------------- dashboard ----------------
router.get('/', (req, res) => {
  const stats = {
    works: db.prepare('SELECT COUNT(*) AS n FROM works').get().n,
    published: db.prepare('SELECT COUNT(*) AS n FROM works WHERE published = 1').get().n,
    categories: db.prepare('SELECT COUNT(*) AS n FROM categories').get().n,
    messages: db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,
  };
  const recentMessages = db.prepare(`SELECT m.*, w.title AS work_title FROM messages m LEFT JOIN works w ON w.id = m.work_id
    ORDER BY m.id DESC LIMIT 5`).all();
  const recentWorks = db.prepare('SELECT * FROM works ORDER BY updated_at DESC, id DESC LIMIT 6').all().map((w) => repo.decorateWork(w));
  res.render('admin/dashboard', { title: 'Dashboard', stats, recentMessages, recentWorks, categories: repo.categories({ includeHidden: true }) });
});

// ---------------- categories ----------------
router.get('/categories', (req, res) => {
  const categories = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM works w WHERE w.category_id = c.id) AS total
    FROM categories c ORDER BY sort_order, id`).all().map((c) => ({ ...repo.decorateCategory(c), total: c.total }));
  res.render('admin/categories', { title: 'Categories', categories });
});

router.get('/categories/new', (req, res) => {
  res.render('admin/category-form', { title: 'New category', cat: { visible: 1 } });
});

router.get('/categories/:id/edit', (req, res, next) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!c) return next();
  res.render('admin/category-form', { title: `Edit ${c.name}`, cat: repo.decorateCategory(c) });
});

async function saveCategory(req, res, id) {
  const b = req.body;
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) { flash(req, 'error', 'Category name is required.'); return res.redirect(id ? `/admin/categories/${id}/edit` : '/admin/categories/new'); }
  const existing = id ? db.prepare('SELECT * FROM categories WHERE id = ?').get(id) : null;
  if (id && !existing) return res.redirect('/admin/categories');
  // Web address is generated from the name; the cover is always the category's top-most (newest) work.
  const data = {
    name,
    slug: uniqueSlug(db, 'categories', name, id),
    tagline: String(b.tagline || '').slice(0, 120),
    description: String(b.description || '').slice(0, 4000),
    visible: b.visible ? 1 : 0,
  };
  if (id) {
    db.prepare(`UPDATE categories SET name=@name, slug=@slug, tagline=@tagline, description=@description,
      visible=@visible WHERE id=@id`).run({ ...data, id });
  } else {
    data.sort_order = (db.prepare('SELECT MAX(sort_order) AS m FROM categories').get().m || 0) + 1;
    db.prepare(`INSERT INTO categories (name, slug, tagline, description, card_ratio, sort_order, visible)
      VALUES (@name, @slug, @tagline, @description, 'original', @sort_order, @visible)`).run(data);
  }
  flash(req, 'ok', `Category "${name}" saved.`);
  res.redirect('/admin/categories');
}

router.post('/categories', (req, res, next) => saveCategory(req, res, null).catch(next));
router.post('/categories/:id', (req, res, next) => saveCategory(req, res, int(req.params.id)).catch(next));

router.post('/categories/:id/move', (req, res) => {
  const list = db.prepare('SELECT id FROM categories ORDER BY sort_order, id').all().map((r) => r.id);
  const i = list.indexOf(int(req.params.id));
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  const upd = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  db.transaction(() => list.forEach((id, k) => upd.run(k + 1, id)))();
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (c) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM works WHERE category_id = ?').get(c.id).n;
    if (n > 0) {
      flash(req, 'error', `"${c.name}" still has ${n} work(s). Move or delete them first.`);
    } else {
      if (c.cover_image) removeImageFiles(c.cover_image);
      db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
      flash(req, 'ok', `Category "${c.name}" deleted.`);
    }
  }
  res.redirect('/admin/categories');
});

// ---------------- works ----------------
router.get('/works', (req, res) => {
  const catId = int(req.query.category, 0);
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (catId) { where.push('w.category_id = ?'); params.push(catId); }
  if (q) { where.push('w.title LIKE ?'); params.push(`%${q}%`); }
  const works = db.prepare(`SELECT w.* FROM works w ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY w.updated_at DESC, w.id DESC`).all(...params).map((w) => repo.decorateWork(w));
  res.render('admin/works', { title: 'Works', works, categories: repo.categories({ includeHidden: true }), catId, q });
});

function workFormLocals(work) {
  return { work, categories: repo.categories({ includeHidden: true }) };
}

router.get('/works/new', (req, res) => {
  res.render('admin/work-form', {
    title: 'New work',
    ...workFormLocals({
      category_id: int(req.query.category, null), published: 1, commission: 0, dim_unit: 'cm', images: [],
    }),
  });
});

router.get('/works/:id/edit', (req, res, next) => {
  const work = repo.workById(int(req.params.id));
  if (!work) return next();
  res.render('admin/work-form', { title: `Edit "${work.title}"`, ...workFormLocals(work) });
});

async function saveWork(req, res, id) {
  const b = req.body;
  const title = String(b.title || '').trim().slice(0, 160);
  if (!title) { flash(req, 'error', 'A title is required.'); return res.redirect(id ? `/admin/works/${id}/edit` : '/admin/works/new'); }
  const existing = id ? db.prepare('SELECT * FROM works WHERE id = ?').get(id) : null;
  if (id && !existing) return res.redirect('/admin/works');

  const catId = int(b.category_id, 0) || null;
  const data = {
    category_id: catId && db.prepare('SELECT id FROM categories WHERE id = ?').get(catId) ? catId : null,
    title,
    // Web address is generated from the title. Images keep their own proportions on cards.
    slug: uniqueSlug(db, 'works', title, id),
    medium: String(b.medium || '').slice(0, 160),
    year: existing ? existing.year : '',
    dim_w: num(b.dim_w), dim_h: num(b.dim_h), dim_d: num(b.dim_d),
    dim_unit: pick(b.dim_unit, ['cm', 'mm', 'in', 'm'], 'cm'),
    display_ratio: 'original',
    display_fit: 'cover',
    display_size: 'normal',
    max_width: existing ? existing.max_width : 2000,
    description: String(b.description || '').slice(0, 4000),
    essay: String(b.essay || '').slice(0, 60000),
    commission: b.commission ? 1 : 0,
    published: b.published ? 1 : 0,
    sort_order: existing ? existing.sort_order : 0,
  };

  if (id) {
    db.prepare(`UPDATE works SET category_id=@category_id, title=@title, slug=@slug, medium=@medium, year=@year,
      dim_w=@dim_w, dim_h=@dim_h, dim_d=@dim_d, dim_unit=@dim_unit, display_ratio=@display_ratio, display_fit=@display_fit,
      display_size=@display_size, max_width=@max_width, description=@description, essay=@essay, commission=@commission,
      published=@published, sort_order=@sort_order, updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...data, id });
  } else {
    id = db.prepare(`INSERT INTO works (category_id, title, slug, medium, year, dim_w, dim_h, dim_d, dim_unit, display_ratio,
      display_fit, display_size, max_width, description, essay, commission, published, sort_order)
      VALUES (@category_id, @title, @slug, @medium, @year, @dim_w, @dim_h, @dim_d, @dim_unit, @display_ratio,
      @display_fit, @display_size, @max_width, @description, @essay, @commission, @published, @sort_order)`).run(data).lastInsertRowid;
  }

  // Existing images: captions, order, removal, cover choice
  const imgs = db.prepare('SELECT * FROM images WHERE work_id = ? ORDER BY sort_order, id').all(id);
  const coverId = int(b.cover_id, 0);
  for (const img of imgs) {
    if (b[`remove_${img.id}`]) {
      db.prepare('DELETE FROM images WHERE id = ?').run(img.id);
      removeImageFiles(img.file);
      continue;
    }
    const order = img.id === coverId ? -1 : int(b[`order_${img.id}`], img.sort_order);
    db.prepare('UPDATE images SET caption = ?, sort_order = ? WHERE id = ?')
      .run(String(b[`caption_${img.id}`] ?? img.caption).slice(0, 600), order, img.id);
  }

  // New uploads
  const uploads = filesFor(req, 'images');
  const newCaptions = [].concat(b.new_caption || []);
  let failed = 0;
  let maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM images WHERE work_id = ?').get(id).m ?? 0;
  for (const [k, f] of uploads.entries()) {
    try {
      const img = await processImage(f.buffer, { maxWidth: data.max_width });
      db.prepare('INSERT INTO images (work_id, file, width, height, caption, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, img.file, img.width, img.height, String(newCaptions[k] || '').slice(0, 600), ++maxOrder);
    } catch { failed++; }
  }

  // normalise order
  const ordered = db.prepare('SELECT id FROM images WHERE work_id = ? ORDER BY sort_order, id').all(id);
  const setOrder = db.prepare('UPDATE images SET sort_order = ? WHERE id = ?');
  db.transaction(() => ordered.forEach((r, k) => setOrder.run(k, r.id)))();

  flash(req, failed ? 'error' : 'ok', failed ? `Saved, but ${failed} file(s) could not be read as images.` : `"${title}" saved.`);
  res.redirect(b.after === 'list' ? '/admin/works' : `/admin/works/${id}/edit`);
}

router.post('/works', (req, res, next) => saveWork(req, res, null).catch(next));
router.post('/works/:id', (req, res, next) => saveWork(req, res, int(req.params.id)).catch(next));

router.post('/works/:id/toggle', (req, res) => {
  const field = req.body.field === 'commission' ? 'commission' : 'published';
  db.prepare(`UPDATE works SET ${field} = 1 - ${field}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(int(req.params.id));
  const back = String(req.body.back || '');
  res.redirect(/^\/admin(\/[\w\-/?=&%.]*)?$/.test(back) ? back : '/admin/works');
});

router.post('/works/:id/delete', (req, res) => {
  const w = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id);
  if (w) {
    for (const img of db.prepare('SELECT file FROM images WHERE work_id = ?').all(w.id)) removeImageFiles(img.file);
    db.prepare('DELETE FROM works WHERE id = ?').run(w.id);
    flash(req, 'ok', `"${w.title}" deleted.`);
  }
  res.redirect('/admin/works');
});

// ---------------- messages ----------------
router.get('/messages', (req, res) => {
  const messages = db.prepare(`SELECT m.*, w.title AS work_title, w.slug AS work_slug FROM messages m
    LEFT JOIN works w ON w.id = m.work_id ORDER BY m.id DESC`).all();
  res.render('admin/messages', { title: 'Enquiries', messages });
});

router.get('/messages/:id', (req, res, next) => {
  const m = db.prepare(`SELECT m.*, w.title AS work_title, w.slug AS work_slug FROM messages m
    LEFT JOIN works w ON w.id = m.work_id WHERE m.id = ?`).get(req.params.id);
  if (!m) return next();
  if (!m.is_read) db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(m.id);
  res.render('admin/message', { title: `Enquiry from ${m.name}`, m });
});

router.post('/messages/:id/unread', (req, res) => {
  db.prepare('UPDATE messages SET is_read = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  flash(req, 'ok', 'Enquiry deleted.');
  res.redirect('/admin/messages');
});

// ---------------- settings ----------------
router.get('/settings', (req, res) => {
  const works = db.prepare('SELECT id, title FROM works WHERE published = 1 ORDER BY title').all();
  res.render('admin/settings', { title: 'Site settings', s: allSettings(), works });
});

router.post('/settings', (req, res) => {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in req.body) out[k] = String(req.body[k]).slice(0, 20000);
  saveSettings(out);
  flash(req, 'ok', 'Settings saved.');
  res.redirect('/admin/settings');
});

router.post('/password', (req, res) => {
  const user = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.adminId);
  const { current = '', next: pw = '', confirm = '', username = '' } = req.body;
  if (!bcrypt.compareSync(String(current), user.password_hash)) flash(req, 'error', 'Current password is incorrect.');
  else if (String(pw).length < 10) flash(req, 'error', 'New password must be at least 10 characters.');
  else if (pw !== confirm) flash(req, 'error', 'New passwords do not match.');
  else {
    const uname = String(username).trim() || user.username;
    db.prepare('UPDATE admin SET username = ?, password_hash = ? WHERE id = ?').run(uname, bcrypt.hashSync(String(pw), 12), user.id);
    flash(req, 'ok', 'Login details updated.');
  }
  res.redirect('/admin/settings#security');
});

module.exports = router;
