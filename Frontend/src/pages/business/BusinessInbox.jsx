import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { useSocketEvent } from '../../context/LiveContext';
import ChatRoom, { JOB_STATUS_LABEL } from '../../components/Chat/ChatRoom';
import { EmptyState, ErrorNote, PageHeader, PageLoader, Pagination, StatTile, StatusChip } from '../../components/Shared/ui';
import { formatDateTime } from '../../utils/format';

export default function BusinessInbox() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/chat-jobs/inbox', { status: status || undefined, page, limit: 20 });
  useSocketEvent('chat:message', useCallback(() => reload(), [reload]));
  useSocketEvent('notification', reload);
  const b = data?.business;

  return (
    <div className="space-y-5">
      <PageHeader icon={MessagesSquare} title={b ? b.name : 'Applicants'} subtitle={b ? `Hiring: ${b.roleTitle}` : 'People who want to work as your chat support agents.'} />
      <ErrorNote message={error} onRetry={reload} />
      {b && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Waiting for you" value={b.pendingCount} tone="text-amber-600" />
            <StatTile label="Hired" value={b.hiredCount} tone="text-emerald-600" />
            <StatTile label="Openings" value={b.openings} />
          </div>
          <p className="card p-4 text-sm text-slate-600">
            Reply to each new applicant within <b>{data.replyHours} hours</b> and decide (Hire / Not selected) within <b>{data.decisionDays} days</b>.
            Otherwise the applicant is refunded and the chat closes.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {[['pending', 'In progress'], ['hired', 'Hired'], ['', 'All']].map(([key, label]) => (
          <button key={key || 'all'} onClick={() => { setStatus(key); setPage(1); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${status === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100 hover:bg-brand-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <section className="card overflow-hidden">
        {loading ? <PageLoader /> : data?.applications?.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.applications.map((a) => (
              <li key={a.applicationId}>
                <Link to={`/business/chats/${a.applicationId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-brand-50/50">
                  <div className="min-w-0">
                    <p className="font-bold">{a.member.username}</p>
                    <p className="text-xs text-slate-500">
                      {a.status === 'pending' && !a.respondedAt
                        ? <span className="font-bold text-rose-600">Reply before {formatDateTime(a.replyDeadline)}</span>
                        : a.status === 'pending' ? `Decide before ${formatDateTime(a.decisionDeadline)}` : `Applied ${formatDateTime(a.createdAt)}`}
                      {a.lastMessageAt && ` · last message ${formatDateTime(a.lastMessageAt)}`}
                    </p>
                  </div>
                  <StatusChip status={a.status} label={JOB_STATUS_LABEL[a.status]} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={MessagesSquare} title="No applicants here" text="When a member unlocks your chat, they appear here." />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </div>
  );
}

export function BusinessChatPage() {
  const { id } = useParams();
  return <ChatRoom key={id} applicationId={id} backTo="/business" backLabel="All applicants" />;
}
