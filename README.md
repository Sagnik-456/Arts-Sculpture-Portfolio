# Artist Portfolio & CV

A bold portfolio website for an impressionist artist. It has category sections (Drawings & Sketches, Paintings,
Sculptures, Ceramics, Pottery & Terracotta, plus any new ones), a page for each work with a description and an
essay, an About & CV page, and a contact form for enquiries. Prices are never shown.

A **private admin panel** at `/admin` lets the artist:

- create, rename, reorder, hide and delete **categories** (with an optional cover image and a default image shape)
- **post works** into any category: upload several images (each with its own caption), then add the title, medium,
  year and artwork dimensions (H × W × D), a short description and a long **essay**
- set the **image display** for each work: card shape (square / portrait / landscape / wide / tall / original), fill or fit,
  size on the category page (normal / wide / tall / large) and the maximum published resolution. The full-size
  originals stay private.
- feature works on the home page, publish or unpublish them as drafts
- read and reply to **enquiries** from the contact form (with optional e-mail notification)
- edit the site text: name, headline, statement, biography, CV lists (exhibitions, education, awards), contact details
- change the admin username and password

## Run it locally

Requires **Node.js 22.9+**.

```bash
npm install
npm run create-admin          # choose a username + password (min 10 chars)
npm run seed                  # optional: loads the sample artworks from /seed-images
npm run dev                   # http://localhost:3000   ·   admin: http://localhost:3000/admin
```

## Project layout

```
src/server.js          Express app, security headers, sessions
src/db.js              SQLite schema + default settings & categories
src/repo.js            data helpers used by the pages
src/images.js          image processing (WebP sizes: sm / md / lg; private originals)
src/routes/public.js   public pages + contact form
src/routes/admin.js    admin panel
views/public, views/partials   public templates
views/admin            admin templates
public/                CSS, JS, images (served at /static)
data/                  database + private originals   (created automatically, not in git)
uploads/               published images              (created automatically, not in git)
```

## Text formatting in descriptions & essays

A blank line starts a new paragraph. `## Heading` makes a heading, `> quote` a pull quote, `**bold**` bold text
and `*italic*` italics.

## Security

- The password is stored as a bcrypt hash. Login attempts and contact form posts are rate-limited.
- All forms use CSRF tokens. Cookies are httpOnly and SameSite, and also Secure in production.
- There's a strict Content-Security-Policy (no inline scripts) and a honeypot field against contact-form spam.
- Uploaded files are re-encoded with sharp, so anything that isn't a real image is rejected.

## Deploying (later)

The site keeps its data in **SQLite plus image files on disk**, so it needs a host with a **persistent disk**,
for example a small VPS, Render with a persistent disk, Railway with a volume, or Fly.io with a volume.

1. Set the environment variables from `.env.example`: at least `NODE_ENV=production`, `SESSION_SECRET`, and
   `DATA_DIR` / `UPLOAD_DIR` pointing at the persistent disk.
2. `npm install --omit=dev && npm start`
3. Create the login with `npm run create-admin`, or set `ADMIN_USERNAME` / `ADMIN_PASSWORD` for the first start.
4. Back up `DATA_DIR` and `UPLOAD_DIR` regularly.

Serverless hosts with no persistent disk (such as Vercel) would need the storage moved to a hosted database
and blob storage first.
