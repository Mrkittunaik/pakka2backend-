// One-off script: creates (or resets) a demo admin login without touching
// any other collection. Safe to run on a DB that already has real data.
//
// Usage:
//   node src/utils/seedAdmin.js
//   node src/utils/seedAdmin.js owner@example.com mypassword "Owner Name" owner
//
// Defaults: admin@milk.com / admin123 / "Demo Admin" / role "owner"

require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const Staff = require('../models/Staff');

async function run() {
  const [, , emailArg, passwordArg, nameArg, roleArg] = process.argv;
  const email = emailArg || 'admin@milk.com';
  const password = passwordArg || 'admin123';
  const name = nameArg || 'Demo Admin';
  const role = roleArg || 'owner'; // owner | admin | manager | support

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await Staff.findOneAndUpdate(
    { email },
    { name, email, passwordHash, role, active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('[seedAdmin] demo admin ready:');
  console.log(`  email:    ${staff.email}`);
  console.log(`  password: ${password}`);
  console.log(`  role:     ${staff.role}`);
  console.log('Login at the admin webapp with these credentials.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
