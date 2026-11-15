const crypto = require('crypto');

// Shared household passcode, sent by the app in the x-tally-passcode header.
// Fails closed: if APP_PASSCODE isn't configured, nothing gets in.
// ponytail: no rate limiting (functions are stateless), so use a long passcode.
function passcodeOk(event, expected = process.env.APP_PASSCODE) {
  if (!expected) return false;
  const given = (event.headers || {})['x-tally-passcode'] || '';
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

const denied = {
  statusCode: 401,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: 'Wrong or missing passcode' })
};

module.exports = { passcodeOk, denied };
