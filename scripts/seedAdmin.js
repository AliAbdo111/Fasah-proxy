require('dotenv').config();
require('../dist/polyfill-web-crypto');
const mongoose = require('mongoose');
const User = require('../dist/schemas/user.schema').default;

/** Admin seed: plaintext only; bcrypt hash is applied in User schema pre('save'). */
function assertStrongAdminPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('SEED_ADMIN_PASSWORD is required');
  }
  const minLen = 12;
  if (password.length < minLen) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be at least ${minLen} characters (strong password policy for admin seed)`
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must include at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must include at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must include at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must include at least one special character');
  }
}

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SEED_ADMIN_PASSWORD || '').trim();
  const username = String(process.env.SEED_ADMIN_USERNAME || 'admin').trim();
  const phone = String(process.env.SEED_ADMIN_PHONE || '').trim();

  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL is required');
  }
  assertStrongAdminPassword(password);

  await mongoose.connect(mongoUri);

  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    user = await User.create({
      email,
      password,
      username,
      phone,
      role: 'admin',
      isActive: true
    });
    console.log(`Created admin user: ${email}`);
  } else {
    user.role = 'admin';
    user.isActive = true;
    user.password = password; // re-hashed by User pre-save hook
    if (username) user.username = username;
    if (phone) user.phone = phone;
    await user.save();
    console.log(`Updated existing user to admin: ${email}`);
  }
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed admin failed:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
