// Create or reset the admin login.
// Usage:  npm run create-admin -- <username> <password>
//    or:  npm run create-admin            (prompts interactively)
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');

async function ask(q, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write('*'); };
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); }));
}

(async () => {
  let [username, password] = process.argv.slice(2);
  if (!username) username = (await ask('Admin username: ')).trim();
  if (!password) password = await ask('Admin password (min 10 chars): ', { hidden: true });
  if (!username || !password || password.length < 10) {
    console.error('Username is required and password must be at least 10 characters.');
    process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 12);
  const existing = db.prepare('SELECT id FROM admin LIMIT 1').get();
  if (existing) {
    db.prepare('UPDATE admin SET username = ?, password_hash = ? WHERE id = ?').run(username, hash, existing.id);
    console.log(`Admin login updated. Username: ${username}`);
  } else {
    db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`Admin created. Username: ${username}`);
  }
})();
