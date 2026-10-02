import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, MessagesSquare, Plus } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ChatRoom, { JOB_STATUS_LABEL } from '../../components/Chat/ChatRoom';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatTile, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

const EMPTY = {
  name: '', description: '', roleTitle: 'Chat support agent', payInfo: '', city: '', image: '', unlockFee: 100, openings: 1, status: 'active',
  username: '', phone: '', password: '', newPassword: '',
};

const toForm = (b) => ({
  ...EMPTY, name: b.name, description: b.description || '', roleTitle: b.roleTitle || '', payInfo: b.payInfo || '', city: b.city || '',
  image: b.image || '', unlockFee: b.unlockFee, openings: b.openings, status: b.status,
});

function BusinessForm({ business, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(business ? toForm(business) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const details = {
      name: f.name.trim(), description: f.description.trim() || undefined, roleTitle: f.roleTitle.trim() || undefined, payInfo: f.payInfo.trim() || undefined,
      city: f.city.trim() || undefined, image: f.image.trim() || undefined, unlockFee: Number(f.unlockFee), openings: Number(f.openings), status: f.status,
    };
    try {
      if (business) {
        await api.put(`/admin/chat-businesses/${business.businessId}`, { ...details, newPassword: f.newPassword || undefined });
      } else {
        await api.post('/admin/chat-businesses', { ...details, username: f.username.trim(), phone: f.phone.trim(), password: f.password });
      }
      toast.success(business ? 'Business updated' : 'Business added', business ? undefined : `They sign in at /login with username "${f.username.trim().toLowerCase()}".`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={business ? 'Edit business' : 'Add business'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <div><label className="label">Business name</label><input className="field" value={f.name} onChange={set('name')} required maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Job title</label><input className="field" value={f.roleTitle} onChange={set('roleTitle')} maxLength={120} /></div>
          <div><label className="label">Town</label><input className="field" value={f.city} onChange={set('city')} maxLength={60} /></div>
        </div>
        <div><label className="label">Pay (shown to members)</label><input className="field" value={f.payInfo} onChange={set('payInfo')} maxLength={300} placeholder="e.g. Ksh 500 per day, paid weekly by Globechart" /></div>
        <div><label className="label">About the job</label><textarea className="field" rows={3} value={f.description} onChange={set('description')} maxLength={2000} placeholder="Hours, languages needed, what the agent will do…" /></div>
        <div><label className="label">Logo URL</label><input className="field" type="url" value={f.image} onChange={set('image')} placeholder="https://…" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Unlock fee</label><input className="field" type="number" min="0" step="1" value={f.unlockFee} onChange={set('unlockFee')} required /></div>
          <div><label className="label">Openings</label><input className="field" type="number" min={business?.hiredCount || 0} step="1" value={f.openings} onChange={set('openings')} required /></div>
          <div><label className="label">Status</label>
            <select className="field" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></div>
        </div>
        <p className="text-xs text-slate-500">Up to 3 applicants can be in progress for each unfilled opening.</p>

        <div className="rounded-2xl bg-brand-50 p-3">
          <p className="label">Business login</p>
          {business ? (
            <>
              <p className="mb-2 text-sm">Username: <b>{business.account?.username}</b> · {business.account?.phone}</p>
              <input className="field" type="text" value={f.newPassword} onChange={set('newPassword')} minLength={8} maxLength={128} placeholder="New password (leave blank to keep)" autoComplete="new-password" aria-label="New password" />
            </>
          ) : (
            <div className="space-y-2">
              <input className="field" value={f.username} onChange={set('username')} required pattern="[A-Za-z0-9_]{3,30}" placeholder="Username e.g. acme_support" aria-label="Login username" />
              <input className="field" value={f.phone} onChange={set('phone')} required placeholder="Phone e.g. 0712345678" aria-label="Business phone" />
              <input className="field" type="text" value={f.password} onChange={set('password')} required minLength={8} maxLength={128} placeholder="Password (min 8 characters)" autoComplete="new-password" aria-label="Login password" />
              <p className="text-xs text-slate-500">Give these to the business. They sign in on the normal member sign-in page and land on their applicants inbox.</p>
            </div>
          )}
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="!text-white" />} {business ? 'Save changes' : 'Add business'}</button>
      </form>
    </Modal>
  );
}

function Businesses({ onChanged }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/chat-businesses', { page, limit: 20 });

  const archive = async (b) => {
    if (!window.confirm(`Archive "${b.name}"? Members can no longer apply. Open applications are still decided or refunded.`)) return;
    try {
      await api.delete(`/admin/chat-businesses/${b.businessId}`);
      toast.success('Business archived');
      reload();
      onChanged();
    } catch (err) {
      toast.error('Could not archive', errorMessage(err));
    }
  };

  return (
    <>
      <button className="btn-primary w-fit" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add business</button>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.businesses.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Business', 'Login', 'Fee', 'Hired / openings', 'In progress', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.businesses.map((b) => (
                <tr key={b.businessId}>
                  <td className="px-4 py-3"><p className="font-bold">{b.name}</p><p className="text-xs text-slate-500">{b.roleTitle}</p></td>
                  <td className="px-4 py-3 text-xs">{b.account?.username}<br />{b.account?.phone}</td>
                  <td className="px-4 py-3">{formatKESShort(b.unlockFee)}</td>
                  <td className="px-4 py-3">{b.hiredCount} / {b.openings}</td>
                  <td className="px-4 py-3">{b.pendingCount}</td>
                  <td className="px-4 py-3"><StatusChip status={b.status} /></td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <button className="font-bold text-brand-600 hover:underline" onClick={() => setEditing(b)}>Edit</button>
                    {b.status !== 'archived' && <button className="font-bold text-rose-600 hover:underline" onClick={() => archive(b)}>Archive</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Briefcase} title="No businesses yet" text="Add a business once it has agreed to hire chat support agents through Globechart." action={<button className="btn-primary" onClick={() => setEditing('new')}>Add business</button>} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {editing && <BusinessForm business={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); onChanged(); }} />}
    </>
  );
}

function Applications() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/admin/job-applications', { status, page, limit: 20 });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Object.entries(JOB_STATUS_LABEL).map(([key, label]) => (
          <button key={key} onClick={() => { setStatus(key); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${status === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.applications.length ? (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Member', 'Business', 'Fee', 'Deadline / closed', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.applications.map((a) => (
                <tr key={a.applicationId}>
                  <td className="px-4 py-3"><p className="font-bold">{a.member?.username}</p><p className="text-xs text-slate-500">{a.member?.phone}</p></td>
                  <td className="px-4 py-3">{a.business?.name}</td>
                  <td className="px-4 py-3">{formatKESShort(a.fee)}{a.refunded && <p className="text-xs font-bold text-emerald-600">refunded</p>}</td>
                  <td className="px-4 py-3 text-xs">
                    {a.status === 'pending'
                      ? a.respondedAt ? `Decide by ${formatDateTime(a.decisionDeadline)}` : <span className="font-bold text-rose-600">Reply by {formatDateTime(a.replyDeadline)}</span>
                      : formatDateTime(a.decidedAt || a.refundedAt)}
                  </td>
                  <td className="px-4 py-3 text-right"><Link className="font-bold text-brand-600 hover:underline" to={`/admin/chat-jobs/chat/${a.applicationId}`}>Open chat</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={MessagesSquare} title="No applications here" />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </>
  );
}

export default function AdminChatJobs() {
  const [tab, setTab] = useState('applications');
  const summary = useFetch('/admin/chat-businesses/summary');
  const s = summary.data;

  return (
    <div className="space-y-5">
      <PageHeader icon={MessagesSquare} title="Chat Jobs" subtitle="Businesses hiring chat support agents, their applicants, and unlock fees." />
      <ErrorNote message={summary.error} onRetry={summary.reload} />
      {s && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={`In progress (${s.pending.count})`} value={formatKESShort(s.pending.fees)} tone="text-amber-600" />
          <StatTile label="Members hired" value={s.hired} tone="text-emerald-600" />
          <StatTile label={`Refunded (${s.refunded.count})`} value={formatKESShort(s.refunded.total)} />
          <StatTile label="Fees kept (hired only)" value={formatKESShort(s.feesKept)} />
        </div>
      )}
      <div className="flex gap-2">
        {[['applications', 'Applications'], ['businesses', 'Businesses']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'applications' ? <Applications /> : <Businesses onChanged={summary.reload} />}
    </div>
  );
}

export function AdminChatPage() {
  const { id } = useParams();
  return <ChatRoom key={id} applicationId={id} backTo="/admin/chat-jobs" backLabel="Chat jobs" />;
}
