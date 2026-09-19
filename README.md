# Globechart

Members buy digital products from a store and earn referral commissions when people in their network buy (3 levels, paid out of the sale price). Deposits and withdrawals go through M-Pesa; withdrawals are approved by the admin.

```
Backend/    Express + MongoDB (Mongoose) + Socket.io, JWT auth
Frontend/   React 18 + Vite + Tailwind
```

## Run it

```bash
# Backend  (http://localhost:5000)
cd Backend
cp .env.example .env      # then fill in MONGODB_URI, JWT_SECRET, ADMIN_*
npm install
npm run dev

# Frontend (http://localhost:5173)
cd Frontend
cp .env.example .env.local
npm install
npm run dev
```

Tests: `npm test` in each folder. Backend tests spin up their own in-memory MongoDB; they never touch the `.env` database.

## Environment (Backend/.env)

Everything is configured here. The server refuses to start, with a readable message, if a required value is missing.

| Variable | Notes |
| --- | --- |
| `MONGODB_URI` | Atlas connection string. `MONGODB_DB` (default `globechart`) is used when the URI has no database name. |
| `JWT_SECRET` | 32+ characters. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_USERNAME` `ADMIN_EMAIL` `ADMIN_PHONE` `ADMIN_PASSWORD` | The admin account. See below. |
| `MPESA_MODE` | `simulate` (dev, no network), `sandbox`, or `live`. `simulate` is refused when `NODE_ENV=production`. |
| `MPESA_CONSUMER_KEY` `MPESA_CONSUMER_SECRET` `MPESA_SHORTCODE` `MPESA_PASSKEY` `MPESA_CALLBACK_URL` | Daraja credentials. The callback URL must be publicly reachable (e.g. an ngrok URL ending in `/api/finance/mpesa/callback`). |
| `CORS_ORIGIN`, `FRONTEND_URL` | Frontend origin(s). |

### Admin account is driven by `.env`

Nothing is seeded and no admin is hardcoded. On every start the backend makes the admin in the database match `ADMIN_*`:

- First start: the admin is created.
- Change `ADMIN_PASSWORD` and restart: the same admin gets the new password and old sessions are signed out.
- Change `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PHONE` and restart: the same account is renamed (it is tracked by an internal flag, not by username).
- Put the password in double quotes if it contains `#` (`ADMIN_PASSWORD="my#pass"`); otherwise `.env` parsing treats `#` as a comment and cuts the password short.
- The admin password and email cannot be changed through the API; `.env` is the only source of truth.
- In production the server rejects a weak `ADMIN_PASSWORD` (under 12 characters or a common default).

### M-Pesa

1. Development: `MPESA_MODE=simulate`. A deposit "confirms" itself after 2 seconds.
2. Sandbox: set `MPESA_MODE=sandbox` and fill in the Daraja sandbox key, secret, passkey, and a public `MPESA_CALLBACK_URL`. The server appends a secret to the callback URL so forged callbacks are ignored.
3. Withdrawals are manual: the admin sends the money via M-Pesa, then confirms in **Admin → Withdrawals** with the M-Pesa code. Rejecting refunds the user.

### Email

Password-reset emails are stubbed: the link is printed in the backend console until `SMTP_*` is provided and `services/email.js` gets a real transport.

## How money moves

- **Main wallet**: M-Pesa deposits. Spent in the store. Not withdrawable.
- **Commission wallet**: referral commissions from real product sales. Withdrawable (minimum and daily limit are admin settings).
- Product commission percentages (level 1/2/3, max 50% combined) are set per product. A referrer only earns while their account is active.
- Balance changes are atomic (conditional updates inside database transactions), so a wallet can't be overspent by concurrent requests.

## Deliberately not built

The reference screenshots also showed pay-to-unlock earning tasks (hotel reviews, Y99, AI training, chat-for-pay), an activation-fee referral scheme, real-money roulette, and a "just withdrawn" popup. Those are excluded on purpose: payouts funded by other users' fees are a pyramid/Ponzi structure and users lose money.

## API

All routes are under `/api`. See `03-API-ENDPOINTS.md` for the original design; the implemented differences are:
`/users/team`, `/finance/limits`, `/finance/deposits/:id`, `/finance/transactions`, `/finance/mpesa/callback`, `/dashboard/*`, and the admin routes for users, withdrawals, products, settings and analytics.
