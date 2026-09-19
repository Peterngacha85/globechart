const { z } = require('zod');
const { isKenyanPhone, normalizePhone } = require('./helpers');

const phone = z
  .string()
  .refine(isKenyanPhone, 'Enter a valid Kenyan phone number, e.g. 0712345678')
  .transform(normalizePhone);

const password = z.string().min(6, 'Password must be at least 6 characters').max(128);

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username: 3-30 letters, numbers or underscore')
    .transform((v) => v.toLowerCase()),
  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .transform((v) => v.toLowerCase())
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone,
  country: z.string().trim().max(60).default('Kenya'),
  password,
  // Referrer's username or referral code
  referralCode: z.string().trim().max(60).optional(),
  agreeTerms: z.literal(true, { error: 'You must accept the Terms of Service and No-Refund Policy' }),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1, 'Refresh token required') });
const forgotPasswordSchema = z.object({ email: z.string().trim().email('Invalid email format').toLowerCase() });
const resetPasswordSchema = z.object({ newPassword: password });

const updateProfileSchema = z
  .object({
    email: z.string().trim().email('Invalid email format').toLowerCase().optional(),
    country: z.string().trim().min(2).max(60).optional(),
    mpesaPhone: phone.optional(),
  })
  .strict();

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
};
