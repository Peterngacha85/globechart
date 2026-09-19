import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Smartphone, XCircle, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { ErrorNote, PageLoader, Spinner } from '../../components/Shared/ui';
import { formatKES, formatKESShort } from '../../utils/format';

const POLL_MS = 3000;
const POLL_LIMIT = 40; // ~2 minutes

export default function RechargePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const limits = useFetch('/finance/limits');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(user.mpesaPhone || user.phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { id, amount, state: waiting|done|failed|timeout, reason }
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (id, sent, attempt = 0) => {
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/finance/deposits/${id}`);
        const tx = data.data;
        if (tx.status === 'completed') {
          setPending({ id, amount: sent, state: 'done' });
          toast.success('Deposit received', `${formatKESShort(sent)} added to your main wallet.`);
          refreshUser().catch(() => {});
          return;
        }
        if (tx.status === 'failed' || tx.status === 'cancelled') {
          setPending({ id, amount: sent, state: 'failed', reason: tx.failureReason });
          return;
        }
      } catch { /* transient: keep polling */ }
      if (attempt >= POLL_LIMIT) setPending({ id, amount: sent, state: 'timeout' });
      else poll(id, sent, attempt + 1);
    }, POLL_MS);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) return setError('Enter a whole number of shillings');
    setBusy(true);
    try {
      const { data } = await api.post('/finance/recharge', { amount: value, mpesaPhone: phone.trim() });
      setPending({ id: data.data.transactionId, amount: value, state: 'waiting' });
      poll(data.data.transactionId, value);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (limits.loading) return <PageLoader />;
  const l = limits.data;

  return (
    <div className="mx-auto max-w-lg">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-50 to-white p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-brand-600">Main wallet</p>
          <p className="mt-2 text-4xl font-extrabold">{formatKES(user.mainWallet.balance)}</p>
          <p className="text-sm text-slate-500">Current balance · {user.username}</p>
        </div>

        {pending ? (
          <div className="p-8 text-center">
            {pending.state === 'waiting' && (<>
              <Spinner className="mx-auto h-12 w-12" />
              <h2 className="mt-4 text-lg font-extrabold">Check your phone</h2>
              <p className="mt-1 text-sm text-slate-600">Enter your M-Pesa PIN to pay {formatKESShort(pending.amount)}. This page updates automatically.</p>
            </>)}
            {pending.state === 'done' && (<>
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
              <h2 className="mt-4 text-lg font-extrabold">Payment received</h2>
              <p className="mt-1 text-sm text-slate-600">{formatKESShort(pending.amount)} was added to your main wallet.</p>
            </>)}
            {(pending.state === 'failed' || pending.state === 'timeout') && (<>
              <XCircle className="mx-auto h-14 w-14 text-rose-500" />
              <h2 className="mt-4 text-lg font-extrabold">{pending.state === 'failed' ? 'Payment not completed' : 'Still waiting'}</h2>
              <p className="mt-1 text-sm text-slate-600">{pending.state === 'failed' ? pending.reason || 'The payment was cancelled.' : 'We have not received confirmation yet. If money left your M-Pesa it will be credited shortly.'}</p>
            </>)}
            {pending.state !== 'waiting' && <button className="btn-primary mt-6" onClick={() => { setPending(null); setAmount(''); }}>Make another deposit</button>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 p-6">
            <ErrorNote message={error || limits.error} />
            <div>
              <p className="label">Deposit amount</p>
              <div className="grid grid-cols-3 gap-2">
                {l.depositQuickAmounts.map((a) => (
                  <button type="button" key={a} onClick={() => setAmount(String(a))}
                    className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${Number(amount) === a ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 hover:bg-brand-50'}`}>
                    Ksh {a.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="relative mt-3">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">Ksh</span>
                <input inputMode="numeric" className="field !py-4 pl-14 text-lg" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} aria-label="Amount" />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Min {formatKESShort(l.minDeposit)} · Max {formatKESShort(l.maxDeposit)}</p>
            </div>
            <div>
              <label htmlFor="phone" className="label">M-Pesa number</label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="phone" className="field pl-11" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-900">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500 font-bold text-white">M</span>
              <p><b>M-Pesa STK Push.</b> You'll get a payment prompt on this number. Enter your M-Pesa PIN to confirm. Money goes to your Main Wallet.</p>
            </div>
            <button className="btn-primary w-full !py-3.5" disabled={busy || !amount}>
              {busy ? <Spinner className="!text-white" /> : <Zap className="h-5 w-5" />} Deposit {amount ? formatKESShort(Number(amount)) : ''} to Main Wallet
            </button>
          </form>
        )}
      </div>
      <Link to="/dashboard" className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Link>
    </div>
  );
}
