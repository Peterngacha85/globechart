import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDollarSign, ShoppingCart, Users, Wallet } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { ErrorNote, GradientStat, PageHeader, PageLoader } from '../../components/Shared/ui';
import { formatKESShort } from '../../utils/format';

const PERIODS = [['day', 'Today'], ['week', '7 days'], ['month', '30 days'], ['year', '12 months'], ['all', 'All time']];

export default function AdminOverview() {
  const [period, setPeriod] = useState('month');
  const { data, loading, error, reload } = useFetch('/admin/analytics/finance', { period });

  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" subtitle="Sales, commissions and payouts across the platform."
        action={
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)} className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${period === k ? 'bg-brand-nav text-white ring-transparent' : 'bg-white ring-brand-100'}`}>{label}</button>
            ))}
          </div>
        } />
      <ErrorNote message={error} onRetry={reload} />
      {loading ? <PageLoader /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GradientStat tone="green" icon={ShoppingCart} label="Product sales" value={formatKESShort(data.totalSales)} hint={`${data.salesCount} orders · avg ${formatKESShort(data.avgOrderValue)}`} />
            <GradientStat tone="purple" icon={BadgeDollarSign} label="Net revenue" value={formatKESShort(data.netRevenue)} hint={`After ${formatKESShort(data.totalCommissions)} commissions`} />
            <GradientStat tone="blue" icon={Wallet} label="Deposits" value={formatKESShort(data.totalDeposits)} hint="M-Pesa money received" />
            <GradientStat tone="pink" icon={Users} label="Users" value={data.totalUsers} hint={`${data.newUsers} new · ${data.activeBuyers} buyers`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-lg font-extrabold">Payouts</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Paid out (approved)</dt><dd className="font-bold">{formatKESShort(data.totalWithdrawals)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Awaiting approval</dt><dd className="font-bold text-amber-600">{formatKESShort(data.pendingWithdrawals)} ({data.pendingWithdrawalCount})</dd></div>
              </dl>
              <Link to="/admin/withdrawals?status=pending" className="btn-primary mt-4">Review pending withdrawals</Link>
            </section>
            <section className="card p-5">
              <h2 className="text-lg font-extrabold">Top earners</h2>
              {data.topEarners.length ? (
                <ol className="mt-3 space-y-2 text-sm">
                  {data.topEarners.map((u, i) => (
                    <li key={u.username} className="flex justify-between"><span><b className="mr-2 text-slate-400">{i + 1}</b>{u.username}</span><span className="font-bold text-emerald-600">{formatKESShort(u.earnings)}</span></li>
                  ))}
                </ol>
              ) : <p className="mt-3 text-sm text-slate-500">No commissions yet.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
