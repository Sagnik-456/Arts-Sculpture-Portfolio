const express = require('express');
const { db } = require('../db');
const repo = require('../repo');
const { csrfVerify, rateLimit } = require('../util');
const { notifyEnquiry } = require('../mailer');

const router = express.Router();

router.get('/', (req, res) => {
  const site = res.locals.site;
  const cats = res.locals.navCategories;
  const commissions = repo.commissionWorks(12);
  const latest = repo.latestWorks(12);
  let heroWork = site.hero_work_id ? repo.workById(Number(site.hero_work_id)) : null;
  if (!heroWork || !heroWork.published || !heroWork.cover) heroWork = latest.find((w) => w.cover) || null;
  const rows = cats.map((c) => ({ category: c, works: repo.worksInCategory(c.id, { limit: 12 }) }));
  res.render('public/home', { title: null, heroWork, commissions, latest, rows, categories: cats });
});

router.get('/category/:slug', (req, res, next) => {
  const category = repo.categoryBySlug(req.params.slug);
  if (!category) return next();
  const works = repo.worksInCategory(category.id);
  res.render('public/category', { title: category.name, category, works, categories: res.locals.navCategories });
});

router.get('/work/:slug', (req, res, next) => {
  const work = repo.workBySlug(req.params.slug);
  if (!work || (work.category && !work.category.visible)) return next();
  const related = work.category_id
    ? repo.worksInCategory(work.category_id, { limit: 13 }).filter((w) => w.id !== work.id).slice(0, 12)
    : [];
  res.render('public/work', { title: work.title, work, related });
});

router.get('/about', (req, res) => {
  res.render('public/about', { title: 'About & CV', categories: res.locals.navCategories });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const works = q ? repo.searchWorks(q) : [];
  res.render('public/search', { title: q ? `Search: ${q}` : 'Search', q, works });
});

function contactPage(req, res, extra = {}) {
  const workId = Number(req.query.work || req.body?.work_id) || null;
  const work = workId ? repo.workById(workId) : null;
  res.render('public/contact', {
    title: 'Contact',
    work: work && work.published ? work : null,
    sent: false,
    errors: [],
    values: {},
    ...extra,
  });
}

router.get('/contact', (req, res) => contactPage(req, res, { sent: req.query.sent === '1' }));

router.post('/contact', rateLimit({ windowMs: 15 * 60 * 1000, max: 8 }), csrfVerify, async (req, res) => {
  const b = req.body;
  // Honeypot: real people never fill the hidden "website" field.
  if (b.website) return res.redirect('/contact?sent=1');

  const v = {
    name: String(b.name || '').trim().slice(0, 120),
    email: String(b.email || '').trim().slice(0, 160),
    phone: String(b.phone || '').trim().slice(0, 40),
    subject: String(b.subject || '').trim().slice(0, 160),
    body: String(b.message || '').trim().slice(0, 5000),
    work_id: Number(b.work_id) || null,
  };
  const errors = [];
  if (!v.name) errors.push('Please tell me your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.push('Please enter a valid e-mail address.');
  if (v.body.length < 5) errors.push('Please write a short message.');
  if (errors.length) return contactPage(req, res, { errors, values: { ...v, message: v.body } });

  const work = v.work_id ? repo.workById(v.work_id) : null;
  db.prepare(`INSERT INTO messages (name, email, phone, subject, work_id, body) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(v.name, v.email, v.phone, v.subject, work ? work.id : null, v.body);
  notifyEnquiry({ to: process.env.NOTIFY_EMAIL || res.locals.site.contact_email, msg: v, workTitle: work && work.title });
  res.redirect('/contact?sent=1');
});

module.exports = router;
