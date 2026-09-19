const crypto = require('crypto');
const { config } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

const BASE_URL = { sandbox: 'https://sandbox.safaricom.co.ke', live: 'https://api.safaricom.co.ke' };

// Safaricom does not sign callbacks, so the callback URL we hand them carries a secret only we can derive
const callbackSecret = () =>
  crypto.createHmac('sha256', config.jwt.secret).update('mpesa-callback').digest('hex').slice(0, 32);

const isValidCallbackSecret = (given) => {
  const expected = Buffer.from(callbackSecret());
  const actual = Buffer.from(String(given || ''));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

// 0712345678 -> 254712345678
const toMsisdn = (phone) => `254${String(phone).replace(/^0/, '')}`;

const timestamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14); // YYYYMMDDHHmmss

async function getAccessToken() {
  const { consumerKey, consumerSecret, mode } = config.mpesa;
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const res = await fetch(`${BASE_URL[mode]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new ApiError(502, 'Could not authenticate with M-Pesa (check MPESA_CONSUMER_KEY / SECRET)');
  return (await res.json()).access_token;
}

function assertConfigured() {
  const { consumerKey, consumerSecret, passkey, callbackUrl } = config.mpesa;
  const missing = [
    ['MPESA_CONSUMER_KEY', consumerKey],
    ['MPESA_CONSUMER_SECRET', consumerSecret],
    ['MPESA_PASSKEY', passkey],
    ['MPESA_CALLBACK_URL', callbackUrl],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new ApiError(503, `M-Pesa is not configured on the server (missing ${missing.join(', ')})`);
  }
}

/** Sends an STK push. Returns { checkoutRequestId, merchantRequestId }. */
async function stkPush({ phone, amount, reference, description }) {
  if (config.mpesa.mode === 'simulate') {
    return { checkoutRequestId: `SIM-${crypto.randomBytes(8).toString('hex')}`, merchantRequestId: 'SIM', simulated: true };
  }

  assertConfigured();
  const { shortcode, passkey, callbackUrl, mode } = config.mpesa;
  const ts = timestamp();
  const token = await getAccessToken();
  const url = new URL(callbackUrl);
  url.searchParams.set('s', callbackSecret());

  const res = await fetch(`${BASE_URL[mode]}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64'),
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: toMsisdn(phone),
      PartyB: shortcode,
      PhoneNumber: toMsisdn(phone),
      CallBackURL: url.toString(),
      AccountReference: String(reference).slice(0, 12),
      TransactionDesc: String(description).slice(0, 13),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ResponseCode !== '0') {
    throw new ApiError(502, body.errorMessage || body.ResponseDescription || 'M-Pesa could not send the payment prompt');
  }
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID };
}

// Pulls the useful fields out of Safaricom's callback payload
function parseCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return null;
  const items = cb.CallbackMetadata?.Item || [];
  const meta = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    success: cb.ResultCode === 0,
    reason: cb.ResultDesc,
    amount: meta.Amount,
    receipt: meta.MpesaReceiptNumber,
  };
}

module.exports = { stkPush, parseCallback, isValidCallbackSecret, callbackSecret, toMsisdn };
