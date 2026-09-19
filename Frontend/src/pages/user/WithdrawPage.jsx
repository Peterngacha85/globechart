import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HandCoins, Info, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { ErrorNote, PageLoader, Spinner } from '../../components/Shared/ui';
import { formatKES, formatKESShort } from '../../utils/format';

export default function WithdrawPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const limits = useFetch('/finance/limits');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(user.mpesaPhone || user.phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (limits.loading) return <PageLoader />;
  const min = limits.data?.minWithdrawal ?? 220;
  const balance = user.commissionWallet.balance;
  const value = Number(amount) || 0;
  const setQuick = (v) => setAmount(String(Math.floor(v * 100) / 100));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/finance/withdraw', { amount: value, mpesaPhone: phone.trim() });
      toast.success('Withdrawal submitted', 'You will be notified once it has been processed.');
      await refreshUser();
      navigate('/dashboard/history?tab=withdrawals');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      {balance < min && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="h-4 w-4 shrink-0" /> You need at least {formatKES(min)} in your commission wallet before you can withdraw.
        </div>
      )}
      <ErrorNote message={error || limits.error} />
      <div className="card flex items-center gap-4 p-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-500 text-white"><HandCoins className="h-6 w-6" /></span>
        <div><p className="font-extrabold">Commission wallet</p><p className="text-sm text-slate-500">{formatKES(balance)} · min {min}</p></div>
      </div>
      <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-slate-700">Withdrawals are paid from commissions earned on product sales. Money you deposit stays in your main wallet for store purchases.</p>

      <div className="rounded-3xl bg-gradient-to-br from-purple-700 to-indigo-500 p-6 text-white shadow-glow">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white/80">Withdraw amount</p>
        <div className="mt-3 flex items-baseline gap-3 border-b border-white/25 pb-4">
          <span className="text-xl font-bold">Ksh</span>
          <input inputMode="decimal" aria-label="Withdraw amount" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            className="w-full bg-transparent text-4xl font-extrabold placeholder:text-white/40" />
        </div>
        <p className="mt-3 text-sm text-white/80">Type how much you want to withdraw</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['MIN', min], ['HALF', balance / 2], ['MAX', balance]].map(([label, v]) => (
          <button type="button" key={label} disabled={balance < min} onClick={() => setQuick(v)} className="card !rounded-2xl py-3 text-sm font-extrabold tracking-wide hover:bg-brand-50 disabled:opacity-50">{label}</button>
        ))}
      </div>

      <div>
        <label htmlFor="phone" className="label">Send to M-Pesa number</label>
        <input id="phone" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
      </div>

      <button className="btn-primary w-full !py-4 text-base" disabled={busy || value < min || value > balance}>
        {busy ? <Spinner className="!text-white" /> : <Send className="h-5 w-5" />} Submit withdrawal {value >= min ? formatKESShort(value) : ''}
      </button>
      <p className="text-center text-sm"><Link to="/dashboard/history?tab=withdrawals" className="font-semibold text-brand-600 hover:underline">View withdrawal history</Link></p>
    </form>
  );
}
