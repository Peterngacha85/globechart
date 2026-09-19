import { useState } from 'react';
import { Link2, Network, Search, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useFetch from '../../hooks/useFetch';
import { EmptyState, ErrorNote, PageLoader, Pagination, StatusChip } from '../../components/Shared/ui';
import CopyButton from '../../components/Shared/CopyButton';
import { formatDate } from '../../utils/format';

const LEVEL_COLORS = ['border-indigo-500', 'border-amber-500', 'border-pink-500', 'border-cyan-500', 'border-lime-500'];

export default function TeamPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const stats = useFetch('/users/referral-stats');
  const team = useFetch('/users/team', { page, limit: 20, search: query || undefined });

  if (stats.loading) return <PageLoader />;
  const link = `${window.location.origin}/register?ref=${user.referralCode}`;
  const members = team.data?.members || [];
  const activeOnPage = members.filter((m) => m.isActive).length;

  return (
    <div className="space-y-5">
      <ErrorNote message={stats.error || team.error} />
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-extrabold"><Network className="h-5 w-5 text-brand-600" /> {user.username}'s Network</h1>
          <a className="btn-primary !px-4 !py-2" href={`https://wa.me/?text=${encodeURIComponent(`Join me on Globechart: ${link}`)}`} target="_blank" rel="noreferrer"><Share2 className="h-4 w-4" /> Share</a>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-brand-100 text-center">
          <div><p className="text-3xl font-extrabold">{stats.data?.totalTeamSize}</p><p className="label !mb-0">Total team</p></div>
          <div><p className="text-3xl font-extrabold text-emerald-600">{stats.data?.directReferrals}</p><p className="label !mb-0">Direct</p></div>
          <div><p className="text-3xl font-extrabold text-pink-500">{team.data?.total ?? '—'}</p><p className="label !mb-0">Listed below</p></div>
        </div>
      </section>

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600"><Link2 className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{link}</span>
        <CopyButton text={link} label="Copy Link" />
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(stats.data?.levels || []).map((l, i) => (
          <div key={l.level} className={`card border-t-4 p-4 text-center ${LEVEL_COLORS[i]}`}>
            <p className="text-2xl font-extrabold">{l.count}</p>
            <p className="text-xs font-bold text-slate-500">L{l.level}{l.level <= 3 ? ' · earns' : ''}</p>
          </div>
        ))}
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <input className="field" placeholder="Search direct members by username…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" aria-label="Search"><Search className="h-5 w-5" /></button>
      </form>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between bg-brand-50 px-5 py-3">
          <h2 className="font-extrabold">Direct members</h2>
          <span className="chip bg-brand-100 text-brand-700">{team.data?.total ?? 0}</span>
        </div>
        {team.loading ? <PageLoader /> : members.length === 0 ? (
          <EmptyState icon={Network} title={query ? 'No matches' : 'No members yet'} text="Share your link to grow your network." />
        ) : (
          <ul className="divide-y divide-brand-100/70">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-4 px-5 py-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500 text-lg font-bold uppercase text-white">{m.username[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.username} <span className="chip bg-indigo-100 text-indigo-700">L1</span></p>
                  <p className="text-xs text-slate-500">{m.phone} · {m.country} · joined {formatDate(m.joinedAt)}</p>
                </div>
                <div className="text-right">
                  <StatusChip status={m.isActive ? 'active' : 'inactive'} />
                  <p className="mt-1 text-xs text-slate-500">{m.referrals} referral{m.referrals === 1 ? '' : 's'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={team.data?.totalPages} onChange={setPage} />
        {members.length > 0 && <p className="px-5 pb-4 text-xs text-slate-400">{activeOnPage} of {members.length} on this page have bought a product ("active").</p>}
      </section>
    </div>
  );
}
