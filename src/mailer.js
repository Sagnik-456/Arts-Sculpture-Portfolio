// Optional e-mail notification for new enquiries. Works only if SMTP_* env vars are set;
// otherwise enquiries are still saved to the admin inbox.
const nodemailer = require('nodemailer');

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function notifyEnquiry({ to, msg, workTitle }) {
  if (!transport || !to) return;
  const lines = [
    `New enquiry from your portfolio website`,
    ``,
    `Name: ${msg.name}`,
    `Email: ${msg.email}`,
    msg.phone ? `Phone: ${msg.phone}` : null,
    workTitle ? `About work: ${workTitle}` : null,
    msg.subject ? `Subject: ${msg.subject}` : null,
    ``,
    msg.body,
  ].filter((l) => l !== null);
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      replyTo: msg.email,
      subject: `Portfolio enquiry: ${workTitle || msg.subject || msg.name}`,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error('Enquiry email failed (message is still saved in admin):', err.message);
  }
}

module.exports = { notifyEnquiry };
