require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../routes/models/User');

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
  if (!password || password.length < 6) {
    throw new Error('SEED_ADMIN_PASSWORD is required and must be at least 6 characters');
  }

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
