import { Layers } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { ErrorNote, PageHeader, PageLoader, StatTile } from '../../components/Shared/ui';
import { formatKESShort } from '../../utils/format';

const TIERS = [
  { level: 1, name: 'Direct', text: 'People you invited yourself' },
  { level: 2, name: 'Indirect', text: 'People invited by your direct members' },
  { level: 3, name: 'Extended', text: 'Third level down' },
  { level: 4, name: 'Level 4', text: 'Counted in your team size (no commission)' },
  { level: 5, name: 'Level 5', text: 'Counted in your team size (no commission)' },
];

export default function LevelsPage() {
  const stats = useFetch('/users/referral-stats');
  const earnings = useFetch('/dashboard/earnings');
  if (stats.loading || earnings.loading) return <PageLoader />;

  const counts = Object.fromEntries((stats.data?.levels || []).map((l) => [l.level, l.count]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader icon={Layers} title="My Levels" subtitle="Your team by level, and the commission each level has earned you." />
      <ErrorNote message={stats.error || earnings.error} />
      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Total team" value={stats.data?.totalTeamSize ?? 0} />
        <StatTile label="Commissions earned" value={formatKESShort(earnings.data?.totalEarnings)} tone="text-emerald-600" />
      </div>
      <section className="card divide-y divide-brand-100/70">
        {TIERS.map((t) => {
          const e = earnings.data?.[`level${t.level}`];
          return (
            <div key={t.level} className="flex items-center gap-4 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 font-extrabold text-brand-700">L{t.level}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t.name}</p>
                <p className="text-xs text-slate-500">{t.text}</p>
              </div>
              <div className="text-right">
                <p className="font-extrabold">{counts[t.level] || 0} <span className="text-xs font-semibold text-slate-500">members</span></p>
                {t.level <= 3 && <p className="text-sm font-semibold text-emerald-600">{formatKESShort(e?.amount)}</p>}
              </div>
            </div>
          );
        })}
      </section>
      <p className="text-sm text-slate-500">
        Commission percentages are set per product and paid from the sale price when someone in your first three levels buys it.
      </p>
    </div>
  );
}
