import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api from '../../services/api';
import { useLive, useSocketEvent } from '../../context/LiveContext';
import { EmptyState, ErrorNote, PageHeader, PageLoader, Pagination } from '../../components/Shared/ui';
import { formatDateTime } from '../../utils/format';

const DOT = { success: 'bg-emerald-500', earnings: 'bg-emerald-500', error: 'bg-rose-500', warning: 'bg-amber-500', withdrawal: 'bg-sky-500' };

export default function NotificationsPage() {
  const live = useLive();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/notifications', { page, limit: 15, isRead: unreadOnly ? false : undefined });
  useSocketEvent('notification', reload);

  const markRead = async (n) => {
    if (!n.isRead) {
      await api.put(`/notifications/${n.notificationId}/read`).catch(() => {});
      live?.setUnread((c) => Math.max(0, c - 1));
      reload();
    }
    if (n.actionUrl) navigate(n.actionUrl);
  };

  const markAll = async () => {
    await api.put('/notifications/mark-all-read');
    live?.setUnread(0);
    reload();
  };

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader icon={Bell} title="Notifications"
        action={<button className="btn-ghost !py-2" onClick={markAll} disabled={!data?.unreadCount}><CheckCheck className="h-4 w-4" /> Mark all read</button>} />
      <div className="flex gap-2">
        {[[false, 'All'], [true, `Unread${data?.unreadCount ? ` (${data.unreadCount})` : ''}`]].map(([val, label]) => (
          <button key={label} onClick={() => { setUnreadOnly(val); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${unreadOnly === val ? 'bg-brand-nav text-white ring-transparent' : 'bg-white ring-brand-100'}`}>{label}</button>
        ))}
      </div>
      <ErrorNote message={error} />
      <section className="card overflow-hidden">
        {loading ? <PageLoader /> : data?.notifications.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.notifications.map((n) => (
              <li key={n.notificationId}>
                <button onClick={() => markRead(n)} className={`flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-brand-50 ${n.isRead ? '' : 'bg-brand-50/60'}`}>
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.isRead ? 'bg-slate-300' : DOT[n.type] || 'bg-brand-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{n.title}</span>
                    <span className="block text-sm text-slate-600">{n.message}</span>
                    <span className="mt-1 block text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={BellOff} title="No notifications yet" text="Notifications will appear here." />}
        <Pagination page={page} totalPages={data ? Math.ceil(data.total / data.limit) : 0} onChange={setPage} />
      </section>
    </div>
  );
}
