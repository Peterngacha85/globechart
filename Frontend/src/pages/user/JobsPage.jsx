import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Briefcase, MessagesSquare, Search, ShieldCheck, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import ChatRoom, { JOB_STATUS_LABEL } from '../../components/Chat/ChatRoom';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

function UnlockModal({ business, terms, onClose }) {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const balance = user.mainWallet.balance;
  const short = balance < business.unlockFee;

  const unlock = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/chat-jobs/${business.businessId}/unlock`);
      toast.success(`${business.name} unlocked`, 'Say hello and introduce yourself.');
      refreshUser().catch(() => {});
      navigate(`/dashboard/jobs/chat/${res.data.data.applicationId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Apply to ${business.name}`} onClose={onClose}>
      <p className="font-bold">{business.roleTitle}</p>
      {business.payInfo && <p className="text-sm text-slate-600">{business.payInfo}</p>}
      <dl className="mt-4 space-y-2 rounded-2xl bg-brand-50 p-4 text-sm">
        <div className="flex justify-between"><dt>Unlock fee</dt><dd className="font-bold">{formatKESShort(business.unlockFee)}</dd></div>
        <div className="flex justify-between"><dt>Main wallet balance</dt><dd className={`font-bold ${short ? 'text-rose-600' : ''}`}>{formatKESShort(balance)}</dd></div>
      </dl>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>Unlocking opens a chat with {business.name} so they can interview you.</li>
        <li><b>Your fee is refunded automatically</b> if they don't reply within {terms.replyHours} hours, don't hire you, or don't decide within {terms.decisionDays} days.</li>
        <li>The fee is only kept if you are hired.</li>
        <li>You can have one open application at a time.</li>
      </ul>
      <div className="mt-3"><ErrorNote message={error} /></div>
      <div className="mt-4 flex gap-3">
        {short ? (
          <button className="btn-primary flex-1" onClick={() => navigate('/dashboard/recharge')}>Add money first</button>
        ) : (
          <button className="btn-primary flex-1" onClick={unlock} disabled={busy}>{busy && <Spinner className="!text-white" />} Pay {formatKESShort(business.unlockFee)} and chat</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function BusinessCard({ b, openApplication, onApply }) {
  const mine = b.myApplication;
  const busy = openApplication && String(openApplication.business.businessId) !== String(b.businessId);
  let action;
  if (mine && ['pending', 'hired'].includes(mine.status)) {
    action = <Link to={`/dashboard/jobs/chat/${mine.applicationId}`} className="btn-primary w-full"><MessagesSquare className="h-4 w-4" /> Open chat</Link>;
  } else if (mine?.status === 'not_selected') {
    action = <button className="btn-ghost w-full" disabled>Not selected (fee refunded)</button>;
  } else if (!b.accepting) {
    action = <button className="btn-ghost w-full" disabled>{b.openingsLeft ? 'Not taking applicants now' : 'All positions filled'}</button>;
  } else if (busy) {
    action = <button className="btn-ghost w-full" disabled>Finish your open application first</button>;
  } else {
    action = <button className="btn-primary w-full" onClick={() => onApply(b)}>Unlock chat · {formatKESShort(b.unlockFee)}</button>;
  }

  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-100 text-brand-600">
          {b.image ? <img src={b.image} alt="" className="h-full w-full object-cover" /> : <Briefcase className="h-6 w-6" />}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-bold">{b.name}</h3>
          <p className="text-sm text-slate-500">{b.roleTitle}{b.city && ` · ${b.city}`}</p>
        </div>
      </div>
      {b.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{b.description}</p>}
      {b.payInfo && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{b.payInfo}</p>}
      <p className="mt-2 text-xs text-slate-500">{b.openingsLeft} opening{b.openingsLeft === 1 ? '' : 's'} left</p>
      {mine && ['pending', 'hired'].includes(mine.status) && <div className="mt-2"><StatusChip status={mine.status} label={JOB_STATUS_LABEL[mine.status]} /></div>}
      <div className="mt-auto pt-4">{action}</div>
    </article>
  );
}

function Browse() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [applying, setApplying] = useState(null);
  const { data, loading, error, reload } = useFetch('/chat-jobs', { page, limit: 12, search: query || undefined });
  const terms = { replyHours: data?.replyHours ?? 48, decisionDays: data?.decisionDays ?? 7 };

  return (
    <>
      <section className="card flex gap-3 p-4 text-sm text-slate-600">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          These businesses are hiring <b>chat support agents</b>. Pay the unlock fee to chat with a business and get interviewed.
          If they <b>don't reply within {terms.replyHours} hours</b>, <b>don't hire you</b>, or don't decide within {terms.decisionDays} days, your fee is
          <b> refunded automatically</b> to your main wallet. You can see every refund under History → Refunds.
        </p>
      </section>

      {data?.openApplication && (
        <Link to={`/dashboard/jobs/chat/${data.openApplication.applicationId}`} className="card flex items-center justify-between gap-3 p-4 ring-2 ring-brand-300">
          <span className="text-sm">
            <b>Open application: {data.openApplication.business.name}.</b>{' '}
            {data.openApplication.respondedAt ? `Decision due by ${formatDateTime(data.openApplication.decisionDeadline)}.` : `Waiting for a reply until ${formatDateTime(data.openApplication.replyDeadline)}.`}
          </span>
          <span className="btn-primary !py-2"><MessagesSquare className="h-4 w-4" /> Open chat</span>
        </Link>
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="field pl-11" placeholder="Search businesses…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" aria-label="Search"><Search className="h-5 w-5" /></button>
      </form>

      <ErrorNote message={error} onRetry={reload} />
      {loading ? <PageLoader /> : data?.businesses?.length ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data.businesses.map((b) => <BusinessCard key={b.businessId} b={b} openApplication={data.openApplication} onApply={setApplying} />)}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      ) : (
        <div className="card"><EmptyState icon={Briefcase} title="No businesses hiring right now" text="New partner businesses are added by the admin. Check back soon." /></div>
      )}
      {applying && <UnlockModal business={applying} terms={terms} onClose={() => setApplying(null)} />}
    </>
  );
}

function MyApplications() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/chat-jobs/my-applications', { page, limit: 10 });
  if (loading) return <PageLoader />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card flex items-center justify-between gap-3 p-5">
        <div>
          <p className="label">Unlock fees refunded to you</p>
          <p className="text-3xl font-extrabold text-emerald-600">{formatKESShort(data?.totalRefunded)}</p>
        </div>
        <Link to="/dashboard/history?tab=refunds" className="btn-ghost"><Undo2 className="h-4 w-4" /> All my refunds</Link>
      </section>
      <section className="card overflow-hidden">
        {data?.applications?.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.applications.map((a) => (
              <li key={a.applicationId}>
                <Link to={`/dashboard/jobs/chat/${a.applicationId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-brand-50/50">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{a.business?.name}</p>
                    <p className="text-xs text-slate-500">
                      Applied {formatDateTime(a.createdAt)} · fee {formatKESShort(a.fee)}
                      {a.refunded && ` · refunded ${formatDateTime(a.refundedAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.refunded && <span className="font-extrabold text-emerald-600">+{formatKESShort(a.fee)}</span>}
                    <StatusChip status={a.status} label={JOB_STATUS_LABEL[a.status]} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={MessagesSquare} title="No applications yet" text="Unlock a business to start your first chat." />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </>
  );
}

export default function JobsPage() {
  const [tab, setTab] = useState('browse');
  return (
    <div className="space-y-5">
      <PageHeader icon={MessagesSquare} title="Chat Jobs" subtitle="Chat with businesses hiring customer support agents." />
      <div className="flex gap-2">
        {[['browse', 'Businesses'], ['mine', 'My applications']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'browse' ? <Browse /> : <MyApplications />}
    </div>
  );
}

export function MemberChatPage() {
  const { id } = useParams();
  return <ChatRoom key={id} applicationId={id} backTo="/dashboard/jobs" backLabel="Chat jobs" />;
}
