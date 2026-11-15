// Copies the Google values into .env so you don't have to paste the private key by hand.
//   node dev/fill-env.mjs <service-account-key.json> <sheet URL or ID>
import fs from 'fs';

const [keyPath, sheet] = process.argv.slice(2);
if (!keyPath || !sheet) {
  console.error('Usage: node dev/fill-env.mjs <service-account-key.json> <sheet URL or ID>');
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error(`No file at ${keyPath}. Use the path of the JSON key you downloaded from Google Cloud.`);
  process.exit(1);
}
if (sheet.includes('…')) {
  console.error('Replace the example Sheet link with your own Sheet\'s URL.');
  process.exit(1);
}
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
  console.error('That file is not a Google service account key (expected "type": "service_account").');
  process.exit(1);
}
const sheetId = sheet.match(/\/d\/([\w-]+)/)?.[1] || sheet;

const set = (text, name, value) => {
  const line = `${name}=${value}`;
  return new RegExp(`^${name}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${name}=.*$`, 'm'), () => line) : text + `\n${line}\n`;
};
let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : fs.readFileSync('.env.example', 'utf8');
env = set(env, 'SHEET_ID', sheetId);
env = set(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL', key.client_email);
env = set(env, 'GOOGLE_PRIVATE_KEY', JSON.stringify(key.private_key)); // one line, \n escaped
fs.writeFileSync('.env', env);
console.log(`Filled SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.
Share the Sheet with ${key.client_email} as Editor if you haven't yet.`);
