const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const crypto = require('crypto');

const { allSettings } = require('./db');
const repo = require('./repo');
const { formatText, parseCvLines, csrfToken } = require('./util');
const { UPLOAD_DIR } = require('./images');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);

if (PROD && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET must be set in production. See .env.example');
  process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: PROD ? '7d' : 0 }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/img/favicon.svg'));

app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieSession({
  name: 'sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  httpOnly: true,
  sameSite: 'lax',
  secure: PROD,
  maxAge: 1000 * 60 * 60 * 24 * 7,
}));
app.use(csrfToken);

// Shared template locals
app.use((req, res, next) => {
  res.locals.site = allSettings();
  res.locals.navCategories = repo.categories();
  res.locals.path = req.path;
  res.locals.formatText = formatText;
  res.locals.parseCvLines = parseCvLines;
  res.locals.isAdmin = Boolean(req.session.adminId);
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/public'));

app.use((req, res) => res.status(404).render('public/404', { title: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).send('That image is too large (max 25 MB).');
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(PORT, () => {
  console.log(`Portfolio running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`);
});
