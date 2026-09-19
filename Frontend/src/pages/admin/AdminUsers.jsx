import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatusChip } from '../../components/Shared/ui';
import { formatDate, formatDateTime, formatKESShort } from '../../utils/format';

function UserDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/admin/users/${id}`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (action) => {
    setBusy(true);
    try {
      await api.put(`/admin/users/${id}/${action}`, action === 'suspend' ? { reason } : {});
      toast.success(action === 'suspend' ? 'User suspended' : 'User reactivated');
      reload();
      onChanged();
    } catch (err) {
      toast.error('Action failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={data ? data.username : 'User'} onClose={onClose}>
      {loading ? <PageLoader /> : (
        <div className="space-y-4 text-sm">
          <ErrorNote message={error} />
          {data && (<>
            <div className="flex items-center gap-2"><StatusChip status={data.status} />{data.role === 'super_admin' && <span className="chip bg-brand-100 text-brand-700">admin</span>}</div>
            <dl className="grid grid-cols-2 gap-3">
              {[['Phone', data.phone], ['Email', data.email || '—'], ['Country', data.country], ['Joined', formatDate(data.joinedAt)],
                ['Main wallet', formatKESShort(data.mainBalance)], ['Commission wallet', formatKESShort(data.commissionBalance)],
                ['Total earned', formatKESShort(data.totalEarnings)], ['Withdrawn', formatKESShort(data.totalWithdrawn)],
                ['Referred by', data.referredBy?.username || '—'], ['Direct referrals', data.referrals], ['Last login', formatDateTime(data.lastLogin)], ['Ref code', data.referralCode]].map(([k, v]) => (
                <div key={k}><dt className="label !mb-0">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
            {data.suspensionReason && <p className="rounded-xl bg-rose-50 p-3 text-rose-700">Suspended: {data.suspensionReason}</p>}
            <div>
              <p className="label">Recent transactions</p>
              {data.transactions.length ? (
                <ul className="max-h-40 divide-y divide-brand-100/70 overflow-y-auto rounded-xl ring-1 ring-brand-100">
                  {data.transactions.map((t) => (
                    <li key={t._id} className="flex justify-between px-3 py-2"><span className="truncate">{t.description || t.type}</span><span className="font-bold">{formatKESShort(t.amount)}</span></li>
                  ))}
                </ul>
              ) : <p className="text-slate-500">None yet.</p>}
            </div>
            {data.role !== 'super_admin' && (
              data.status === 'suspended' ? (
                <button className="btn-success w-full" disabled={busy} onClick={() => act('reactivate')}>{busy && <Spinner className="!text-white" />} Reactivate user</button>
              ) : (
                <div className="space-y-2">
                  <input className="field" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                  <button className="btn-danger w-full" disabled={busy} onClick={() => act('suspend')}>{busy && <Spinner className="!text-white" />} Suspend user</button>
                </div>
              )
            )}
          </>)}
        </div>
      )}
    </Modal>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/users', { page, limit: 20, search: query || undefined, status: status || undefined });

  return (
    <div className="space-y-5">
      <PageHeader icon={Users} title="Users" subtitle={data ? `${data.total} members` : ''} />
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <input className="field !w-auto flex-1" placeholder="Search username, email or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
        </select>
        <button className="btn-primary" aria-label="Search"><Search className="h-5 w-5" /></button>
      </form>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.users.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>{['User', 'Phone', 'Status', 'Joined', 'Main', 'Commission', 'Earned', 'Refs'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.users.map((u) => (
                <tr key={u.userId} className="cursor-pointer hover:bg-brand-50/60" onClick={() => setSelected(u.userId)}>
                  <td className="px-4 py-3 font-bold">{u.username}{u.role === 'super_admin' && <span className="chip ml-2 bg-brand-100 text-brand-700">admin</span>}</td>
                  <td className="px-4 py-3">{u.phone}</td>
                  <td className="px-4 py-3"><StatusChip status={u.status} /></td>
                  <td className="px-4 py-3">{formatDate(u.joinedAt)}</td>
                  <td className="px-4 py-3">{formatKESShort(u.mainBalance)}</td>
                  <td className="px-4 py-3">{formatKESShort(u.commissionBalance)}</td>
                  <td className="px-4 py-3">{formatKESShort(u.totalEarnings)}</td>
                  <td className="px-4 py-3">{u.referrals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Users} title="No users found" />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {selected && <UserDetail id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}
