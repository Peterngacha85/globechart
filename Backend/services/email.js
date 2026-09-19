const { config } = require('../config/env');

// Stub: SMTP is not available yet. Messages are printed to the server console.
// Swap the body for a real transport (e.g. nodemailer) once SMTP_* is configured.
async function sendEmail({ to, subject, text }) {
  if (!config.smtp.host) {
    if (!config.isTest) console.log(`[email stub] to=${to} subject="${subject}"\n${text}`);
    return { stubbed: true };
  }
  throw new Error('SMTP transport not implemented yet');
}

module.exports = { sendEmail };
