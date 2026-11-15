const cloudinary = require('cloudinary').v2;
const { passcodeOk, denied } = require('./lib/passcode');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (!passcodeOk(event)) return denied;
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  try {
    const { image } = JSON.parse(event.body || '{}');
    if (!image || !image.startsWith('data:image/')) {
      return json(400, { success: false, error: 'Expected a base64 data URI image' });
    }
    const result = await cloudinary.uploader.upload(image, {
      folder: 'tally-card-logos',
      resource_type: 'image',
      transformation: [{ width: 400, height: 250, crop: 'limit' }]
    });
    return json(200, { success: true, url: result.secure_url });
  } catch (err) {
    return json(500, { success: false, error: err.message });
  }
};
