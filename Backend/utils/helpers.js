const crypto = require('crypto');

const KENYA_PHONE = /^(\+254|254|0)[17]\d{8}$/;

// Any accepted Kenyan format -> canonical local format 07XXXXXXXX
const normalizePhone = (phone) => String(phone).trim().replace(/[\s-]/g, '').replace(/^(\+254|254)/, '0');

const isKenyanPhone = (phone) => KENYA_PHONE.test(String(phone).trim().replace(/[\s-]/g, ''));

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 8 chars, crypto-random, unambiguous alphabet
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (length = 8) => {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// ?page=&limit= with sane bounds
const paginate = (query, defaultLimit = 20) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { KENYA_PHONE, normalizePhone, isKenyanPhone, escapeRegex, randomCode, sha256, paginate };
