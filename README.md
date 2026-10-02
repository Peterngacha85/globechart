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

### Coming Soon mode

Set `COMING_SOON=ON` in the backend environment (on Render: **Environment** tab) to put the site behind a launch page. `OFF` (or leaving it out) opens the site. Render restarts the backend when an environment variable changes; locally, restart it yourself.

- The whole site is one Coming Soon page listing what's coming, at every address, for every account (the admin included). Optional `LAUNCH_DATE` (with timezone, e.g. `2026-11-01T09:00:00+03:00`) adds a live countdown.
- The server enforces it: sign-up, sign-in and every signed-in API call answer `503` with `comingSoon: true`, and sockets are refused. Only `/api/site` (which the page reads), `/api/health` and M-Pesa callbacks keep answering.
- To set things up before launch, switch it `OFF`, do the work, then switch it back `ON`.

### M-Pesa

1. Development: `MPESA_MODE=simulate`. A deposit "confirms" itself after 2 seconds.
2. Sandbox: set `MPESA_MODE=sandbox` and fill in the Daraja sandbox key, secret, passkey, and a public `MPESA_CALLBACK_URL`. The server appends a secret to the callback URL so forged callbacks are ignored.
3. Withdrawals are manual: the admin sends the money via M-Pesa, then confirms in **Admin → Withdrawals** with the M-Pesa code. Rejecting refunds the user.

### Email

Password-reset emails are stubbed: the link is printed in the backend console until `SMTP_*` is provided and `services/email.js` gets a real transport.

## How money moves

- **Main wallet**: M-Pesa deposits. Spent in the store. Not withdrawable.
- **Commission wallet**: referral commissions from real product sales and approved hotel review bonuses. Withdrawable (minimum and daily limit are admin settings).
- **Bonus credit**: lucky spin prizes. Not withdrawable, never expires. Spent first on hotel review fees and chat job unlocks (the main wallet covers the rest); a refunded fee goes back to the wallets it came from.
- Product commission percentages (level 1/2/3, max 50% combined) are set per product. A referrer only earns while their account is active.
- Balance changes are atomic (conditional updates inside database transactions), so a wallet can't be overspent by concurrent requests.

## Hotel reviews

The admin signs an agreement with a hotel (outside the system), then adds it in **Admin → Hotel Reviews** with its GPS point, a fee, a bonus and a number of **slots**. Bonuses are funded by the admin, who is paid by the hotels; slots × bonus is the most she has committed to pay for that hotel.

1. A member pays the fee (default Ksh 100) from the main wallet. This reserves one slot for 48 hours.
2. At the hotel, the member submits a 1–5 star rating, a written review and a photo. The browser's GPS position must be within 200 m of the hotel.
3. The admin checks the photo and location. **Approve** pays the bonus (default Ksh 200) into the withdrawable commission wallet. **Reject** needs a reason and refunds the fee, unless the admin marks the review as fake; then the fee is kept and the member can't review that hotel again.
4. A reservation that isn't submitted within 48 hours expires; the fee is refunded and the slot freed (checked every 10 minutes and on each hotel request).

Safeguards: a hotel never accepts more reservations than its slots (concurrent requests included), one review per member per hotel, fees and bonuses are separate ledger types (`review_fee`, `review_bonus`), and the admin summary shows bonuses paid, fees kept after refunds, and the most still owed. Approved reviews are public on the hotel page, labelled **Sponsored**.

GPS can be faked on a rooted phone or with a mock-location app, so the photo is the admin's main proof. Browsers only share location over **HTTPS** (or `localhost`), so the deployed frontend must use HTTPS.

## Chat jobs

The admin signs up businesses that need chat customer support agents (outside the system), then adds each one in **Admin → Chat Jobs** with an unlock fee, a number of openings, and a **business login** (username, phone, password). The business signs in on the normal `/login` page and lands on its own **applicants inbox** at `/business`.

1. A member pays the unlock fee (default Ksh 100) from the main wallet. This opens a text chat with the business, which interviews them.
2. The business clicks **Hire** (the fee is kept; the admin pays the agent's wages outside the system) or **Not selected** (the fee is refunded).
3. If the business doesn't reply within **48 hours**, or doesn't decide within **7 days**, the application closes and the fee is refunded automatically. A reply sent after the 48 hours does not cancel a refund that is already due.

Rules: one open application per member; one application per member per business (after a no-reply or no-decision refund they may try that business again); at most 3 applicants in progress per unfilled opening, and no hiring beyond the openings. The admin can read every chat, write in it, and decide on a business's behalf.

Every refund (chat jobs and hotel reviews) is a `refund` transaction with the reason in its description. Members see them under **History → Refunds**, on the dashboard's **My refunds** card (with fees still awaiting a result), and in **Chat Jobs → My applications**.

## Lucky spin

Every member gets **3 free spins a day** (reset at midnight Africa/Nairobi). The wheel has **40 equal slices** carrying Ksh 30, 35, 45, 50, 55, 60, 70, 80, 90, 100, 150, 210 and 300; a prize's chance is how many slices carry it (Ksh 30 is on 14 slices = 35%; 150, 210 and 300 are on one each = 2.5%), an average of Ksh 58.25. The layout is `WHEEL` in `Backend/services/spinService.js`, and the members' wheel is drawn from it. The server draws a cryptographic random number from 0 to 9,999; every 250 numbers is one slice, clockwise from the top, and the wheel stops where the roll landed. Every spin's roll and slice are stored and shown in the member's history.

The admin sets a **daily prize budget** for all members (`spin_daily_budget`, default Ksh 2,000) in **Admin → Lucky Spin**. Spins pause for the day once less than the top prize is left, so the published odds never change. The page also shows credit given, credit spent on fees, and credit members still hold.

Spins are free on purpose. Paying to spin for a prize of value (cash or credit that pays for things) is gambling and needs a BCLB licence in Kenya.

## AI prompt training and the Y99 Earn Program

The admin runs two **in-person programmes** on the same system: **AI Prompt Training** (prompt-writing classes) and the **Y99 Earn Program** (practical skills members can earn from as a job or side hustle). Teaching happens at the venue, not in the app. Each session belongs to one programme; members see them on separate pages (`/dashboard/training` and `/dashboard/y99`). She lists sessions in **Admin → Training & Y99** (programme, title, venue, map link, start time, length, seats, fee). Members book a seat for the registration fee (default Ksh 100, bonus credit first) and get an 8-character **ticket code**.

- A member who cancels at least **24 hours** before the class is refunded and the seat frees up; later cancellations and no-shows are not refunded.
- If the admin cancels a session, everyone booked is refunded automatically, with her reason.
- On the day she checks people in by ticket code (or from the list), then **completes** the session; anyone not checked in is marked absent.
- She can issue attendees a **certificate** with a code (`GC-…`). Anyone can check it at `/verify/<code>` without an account, and the page prints as the certificate.

Practice prompts are done in class; members are not paid for prompts.

## Not built (yet)

The reference screenshots also showed other earning tasks (paid AI-training tasks), an activation-fee referral scheme, paid spins / real-money roulette, and a "just withdrawn" popup. These are not built. Any payout must be funded by a real outside source (as hotel bonuses are funded by the admin and hotels), never by other members' fees, or it becomes a pyramid/Ponzi structure and users lose money.

## API

All routes are under `/api`. See `03-API-ENDPOINTS.md` for the original design; the implemented differences are:
`/users/team`, `/finance/limits`, `/finance/deposits/:id`, `/finance/transactions`, `/finance/mpesa/callback`, `/dashboard/*`, `/hotels/*`, `/chat-jobs/*`, `/spin`, and the admin routes for users, withdrawals, products, hotels, hotel reviews, chat businesses, job applications, spin summary, settings and analytics.
