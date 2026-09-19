const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { normalizePhone, randomCode } = require('../utils/helpers');

/**
 * Makes the admin account in the database match ADMIN_* from .env.
 *
 * The account is identified by the isSystemAdmin flag, not by username, so changing
 * ADMIN_USERNAME renames the existing admin instead of creating a second one.
 * Runs on every server start; a no-op when nothing changed.
 */
async function syncAdminFromEnv(cfg, log = console) {
  const username = cfg.admin.username;
  const email = cfg.admin.email;
  const phone = normalizePhone(cfg.admin.phone);
  const { password } = cfg.admin;

  const admin = await User.findOne({ isSystemAdmin: true }).select('+password');

  // Never take over (or collide with) a regular member who already uses these identifiers
  const clash = await User.findOne({
    $or: [{ username }, { email }, { phone }],
    ...(admin ? { _id: { $ne: admin._id } } : {}),
  }).select('username email phone');
  if (clash) {
    throw new Error(
      `ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PHONE in .env clash with the existing member "${clash.username}". ` +
        'Pick different admin values.'
    );
  }

  if (!admin) {
    await User.create({
      username,
      email,
      phone,
      password,
      role: 'super_admin',
      isSystemAdmin: true,
      isVerified: true,
      referralCode: randomCode(),
    });
    log.log(`Admin account "${username}" created from .env`);
    return { action: 'created' };
  }

  const changed = [];
  let credentialsChanged = false;

  if (admin.username !== username) {
    admin.username = username;
    changed.push('username');
    credentialsChanged = true;
  }
  if (admin.email !== email) {
    admin.email = email;
    changed.push('email');
  }
  if (admin.phone !== phone) {
    admin.phone = phone;
    changed.push('phone');
  }
  if (!(await bcrypt.compare(password, admin.password))) {
    admin.password = password; // re-hashed by the pre-save hook
    changed.push('password');
    credentialsChanged = true;
  }
  if (admin.role !== 'super_admin') {
    admin.role = 'super_admin';
    changed.push('role');
  }
  if (admin.status !== 'active') {
    admin.status = 'active';
    changed.push('status');
  }
  // Sessions issued under the old credentials stop working
  if (credentialsChanged) admin.tokenVersion += 1;

  if (changed.length) {
    await admin.save();
    log.log(`Admin account synced from .env (updated: ${changed.join(', ')})`);
  }

  const strays = await User.countDocuments({ role: 'super_admin', _id: { $ne: admin._id } });
  if (strays) log.warn(`Warning: ${strays} other super_admin account(s) exist that are not managed by .env`);

  return { action: changed.length ? 'updated' : 'unchanged', changed };
}

module.exports = { syncAdminFromEnv };
