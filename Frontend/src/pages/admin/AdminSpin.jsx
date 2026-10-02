import { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ErrorNote, PageHeader, PageLoader, Spinner, StatTile } from '../../components/Shared/ui';
import { formatKESShort } from '../../utils/format';

function BudgetForm({ budget, averagePrize, spinsPerDay, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(String(budget));
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(budget)), [budget]);
  const perMember = averagePrize * spinsPerDay;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/admin/settings', { setting: 'spin_daily_budget', value: Number(value) });
      toast.success('Daily budget saved');
      onSaved();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card space-y-3 p-5">
      <h2 className="font-extrabold">Daily prize budget</h2>
      <div className="flex flex-wrap gap-2">
        <input className="field !w-48" type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Daily prize budget in Ksh" />
        <button className="btn-primary" disabled={busy || value === '' || Number(value) === budget}>{busy ? <Spinner className="!text-white" /> : <Save className="h-4 w-4" />} Save</button>
      </div>
      <p className="text-sm text-slate-600">
        The most you give away in spin credit per day, across all members. Spins pause for the day once less than Ksh 300 (the top prize) is left.
        A member using all {spinsPerDay} spins costs about {formatKESShort(perMember)} a day on average, so {formatKESShort(Number(value) || 0)} covers roughly{' '}
        <b>{Math.floor((Number(value) || 0) / perMember)} fully active members</b> a day.
      </p>
    </form>
  );
}

export default function AdminSpin() {
  const { data: s, loading, error, reload } = useFetch('/admin/spin/summary');
  if (loading) return <PageLoader />;
  if (!s) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader icon={Sparkles} title="Lucky Spin" subtitle={`Free spins (${s.spinsPerDay} per member per day). Prizes are bonus credit, spendable on fees only.`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Given today (${s.today.spins} spins)`} value={`${formatKESShort(s.today.paid)} / ${formatKESShort(s.budget)}`} tone="text-brand-600" />
        <StatTile label="Given in total" value={formatKESShort(s.totalWon)} />
        <StatTile label="Spent by members on fees" value={formatKESShort(s.spentOnFees)} tone="text-emerald-600" />
        <StatTile label="Credit still held by members" value={formatKESShort(s.creditOutstanding)} tone="text-amber-600" />
      </div>
      <BudgetForm budget={s.budget} averagePrize={s.averagePrize} spinsPerDay={s.spinsPerDay} onSaved={reload} />

      <section className="card p-5">
        <h2 className="font-extrabold">Odds (shown to members)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.odds.map((o) => (
            <span key={o.amount} className="rounded-xl bg-brand-50 px-3 py-2 text-sm"><b>{formatKESShort(o.amount)}</b> · {Math.round(o.chance * 100)}%</span>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">Average prize {formatKESShort(s.averagePrize)} per spin. Credit spent on fees only costs you when it pays a fee you would otherwise have collected.</p>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-5 font-extrabold">Last 14 days</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-2">Day</th><th className="px-5 py-2">Spins</th><th className="px-5 py-2">Prizes given</th></tr></thead>
          <tbody className="divide-y divide-brand-100/70">
            {s.days.length ? s.days.map((d) => (
              <tr key={d.day}><td className="px-5 py-2">{d.day}</td><td className="px-5 py-2">{d.spins}</td><td className="px-5 py-2">{formatKESShort(d.paid)}</td></tr>
            )) : <tr><td className="px-5 py-4 text-slate-500" colSpan={3}>No spins yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
