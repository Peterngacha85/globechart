import { Link } from 'react-router-dom';
import { ArrowUpRight, Coffee, Hotel, Link2, Send, ShoppingBag, TrendingUp, Undo2, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useFetch from '../../hooks/useFetch';
import { useSocketEvent } from '../../context/LiveContext';
import { ErrorNote, GradientStat, PageLoader } from '../../components/Shared/ui';
import CopyButton from '../../components/Shared/CopyButton';
import { formatDate, formatKES, formatKESShort, greeting } from '../../utils/format';

const referralLink = (code) => `${window.location.origin}/register?ref=${code}`;

function ShareRow({ link }) {
  const text = encodeURIComponent(`Join me on Globechart: ${link}`);
  const buttons = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${text}`, cls: 'bg-emerald-500' },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${text}`, cls: 'bg-sky-500' },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, cls: 'bg-blue-600' },
    { label: 'Email', href: `mailto:?subject=Join%20me%20on%20Globechart&body=${text}`, cls: 'bg-rose-500' },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-slate-500">Share:</span>
      {buttons.map((b) => (
        <a key={b.label} href={b.href} target="_blank" rel="noreferrer" className={`rounded-xl px-3 py-2 text-xs font-bold text-white ${b.cls}`}>
          {b.label}
        </a>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const summary = useFetch('/dashboard/summary');
  const earnings = useFetch('/dashboard/earnings');
  useSocketEvent('commission:earned', () => { summary.reload(); earnings.reload(); refreshUser().catch(() => {}); });

  if (summary.loading || earnings.loading) return <PageLoader />;
  const s = summary.data;
  const e = earnings.data;
  const link = referralLink(user.referralCode);

  return (
    <div className="space-y-6">
      <ErrorNote message={summary.error || earnings.error} onRetry={() => { summary.reload(); earnings.reload(); }} />

      <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-glow"><Coffee className="h-6 w-6" /></span>
          <p className="text-lg font-bold">{greeting()}, <span className="text-brand-600">{user.username}</span></p>
        </div>
        <Link to="/dashboard/withdraw" className="btn-success"><Send className="h-4 w-4" /> Withdraw</Link>
      </div>

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GradientStat tone="green" label="Available balance" icon={TrendingUp} value={formatKES(s.availableBalance)} hint={`Withdrawable via M-Pesa · min Ksh ${s.minWithdrawal}`} />
          <GradientStat tone="purple" label="Today's earnings" icon={ArrowUpRight} value={formatKES(s.todaysEarnings)} hint="Commissions and review bonuses today (Africa/Nairobi)" />
          <GradientStat tone="pink" label="Total withdrawn" icon={Send} value={formatKES(s.totalWithdrawn)} hint="Paid out to your M-Pesa" />
          <GradientStat tone="violet" label="Lifetime confirmed" icon={Wallet} value={formatKES(s.lifetimeConfirmed)} hint="All-time commissions and review bonuses" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-extrabold">Earnings</h2>
          <p className="text-sm text-slate-500">Commissions when someone in your network buys a product, plus approved hotel review bonuses</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[['L1', 'Direct', e?.level1], ['L2', 'Indirect', e?.level2], ['L3', 'Extended', e?.level3]].map(([tag, name, v]) => (
              <div key={tag} className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100">
                <span className="chip bg-brand-100 text-brand-700">{tag}</span>
                <p className="mt-3 text-xl font-extrabold">{formatKESShort(v?.amount)}</p>
                <p className="text-xs text-slate-500">{name} · {v?.count || 0} sale{v?.count === 1 ? '' : 's'}</p>
              </div>
            ))}
            <Link to="/dashboard/hotels" className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-4 ring-1 ring-emerald-100 hover:ring-emerald-300">
              <span className="chip bg-emerald-100 text-emerald-700"><Hotel className="mr-1 h-3 w-3" /> Hotels</span>
              <p className="mt-3 text-xl font-extrabold">{formatKESShort(e?.hotelReviews?.amount)}</p>
              <p className="text-xs text-slate-500">Reviews · {e?.hotelReviews?.count || 0} approved</p>
            </Link>
          </div>
          {!e?.totalEarnings && (
            <div className="mt-5 rounded-2xl bg-brand-50 p-4 text-center">
              <p className="font-bold">Start earning commissions</p>
              <p className="mt-1 text-sm text-slate-600">Invite friends. When they buy a product from the store, you earn a share of the sale, up to 3 levels deep.</p>
              <Link to="/dashboard/store" className="btn-ghost mt-3"><ShoppingBag className="h-4 w-4" /> Browse the store</Link>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Wallets</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Main wallet (deposits)</dt><dd className="font-bold">{formatKES(s?.mainBalance)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Commission wallet</dt><dd className="font-bold text-emerald-600">{formatKES(s?.availableBalance)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500"><Link to="/dashboard/spin" className="hover:underline">Bonus credit (spins)</Link></dt><dd className="font-bold text-brand-600">{formatKES(s?.bonusBalance)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Withdrawn today</dt><dd className="font-bold">{formatKES(s?.withdrawnToday)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Transactions</dt><dd className="font-bold">{s?.transactions}</dd></div>
          </dl>
          <Link to="/dashboard/history?tab=refunds" className="mt-4 block rounded-2xl bg-emerald-50/70 p-3 text-sm ring-1 ring-emerald-100 hover:ring-emerald-300">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-emerald-800"><Undo2 className="h-4 w-4" /> My refunds</span>
              <span className="font-extrabold text-emerald-700">{formatKES(s?.refunds?.total)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {s?.refunds?.count || 0} refund{s?.refunds?.count === 1 ? '' : 's'} received
              {s?.feesAwaitingOutcome > 0 && ` · ${formatKESShort(s.feesAwaitingOutcome)} in fees awaiting a result (refunded if not hired or approved)`}
            </p>
          </Link>
          <Link to="/dashboard/recharge" className="btn-primary mt-5 w-full">Add money to main wallet</Link>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-600"><Users className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-extrabold">Affiliate network</h2>
            <p className="text-sm text-slate-500">Share your link to earn continuous commissions.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Direct affiliates', s?.directReferrals], ['Active members', s?.activeDownlines], ['Affiliate handle', user.username], ['Referral code', user.referralCode]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100">
              <p className="label !mb-1">{k}</p>
              <p className="truncate text-xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
          <p className="label">Your exclusive affiliate link</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
              <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate font-mono text-sm">{link}</span>
            </div>
            <CopyButton text={link} label="Copy link" />
          </div>
          <ShareRow link={link} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Account details</h2>
        <dl className="mt-3 divide-y divide-brand-100/70 text-sm">
          {[['Username', user.username], ['Status', user.status], ['Country', user.country || '—'], ['Currency', 'Ksh (KES)'], ['Joined', formatDate(user.createdAt)], ['Verified', user.isVerified ? 'Yes' : 'No']].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2.5"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{k}</dt><dd className="font-semibold capitalize">{v}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
