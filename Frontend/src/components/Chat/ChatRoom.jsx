import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Clock, Send, Undo2 } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useSocketEvent } from '../../context/LiveContext';
import { useToast } from '../../context/ToastContext';
import { ErrorNote, PageLoader, Spinner, StatusChip } from '../Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

export const JOB_STATUS_LABEL = {
  pending: 'In progress',
  hired: 'Hired',
  not_selected: 'Not selected',
  no_response: 'No reply · refunded',
  expired: 'No decision · refunded',
};

const ROLE_NAME = { member: 'Applicant', business: 'Business', admin: 'Admin' };

/** What each side needs to know about deadlines and money right now. */
function StatusBanner({ app }) {
  const member = app.viewerRole === 'member';
  const biz = app.business.name;
  let tone = 'bg-amber-50 text-amber-800 ring-amber-200';
  let Icon = Clock;
  let text;

  if (app.status === 'hired') {
    tone = 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    Icon = BadgeCheck;
    text = member ? `You're hired by ${biz}!${app.note ? ` ${app.note}` : ''}` : `${app.member.username} was hired${app.note ? `: ${app.note}` : ''}.`;
  } else if (app.refunded) {
    tone = 'bg-slate-50 text-slate-700 ring-slate-200';
    Icon = Undo2;
    const why = { not_selected: 'not selected', no_response: `no reply within ${app.replyHours} hours`, expired: `no decision within ${app.decisionDays} days` }[app.status];
    text = `Closed (${why}${app.note ? `: ${app.note}` : ''}). ${member ? 'Your' : 'The'} ${formatKESShort(app.fee)} unlock fee was refunded on ${formatDateTime(app.refundedAt)}.`;
  } else if (!app.respondedAt) {
    text = member
      ? `Waiting for ${biz} to reply. If they don't reply by ${formatDateTime(app.replyDeadline)}, your ${formatKESShort(app.fee)} is refunded automatically.`
      : `Reply before ${formatDateTime(app.replyDeadline)}, or the applicant is refunded and this chat closes.`;
  } else {
    text = member
      ? `${biz} has replied. A decision is due by ${formatDateTime(app.decisionDeadline)}. If you're not hired, or there's no decision, your ${formatKESShort(app.fee)} is refunded.`
      : `Decide before ${formatDateTime(app.decisionDeadline)}. Without a decision the applicant is refunded and this chat closes.`;
  }
  return (
    <div className={`flex gap-2 rounded-2xl px-4 py-3 text-sm ring-1 ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function DecisionPanel({ app, onDecided }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const decide = async (outcome) => {
    const label = outcome === 'hired' ? `Hire ${app.member.username}?` : `Mark ${app.member.username} as not selected? Their ${formatKESShort(app.fee)} fee will be refunded.`;
    if (!window.confirm(label)) return;
    setBusy(outcome);
    setError('');
    try {
      await api.put(`/chat-jobs/applications/${app.applicationId}/decide`, { outcome, note: note.trim() || undefined });
      toast.success(outcome === 'hired' ? 'Applicant hired' : 'Applicant not selected, fee refunded');
      onDecided();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-2 rounded-2xl bg-brand-50 p-3">
      <label className="label" htmlFor="decision-note">Decision (message to the applicant, optional)</label>
      <input id="decision-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Training starts Monday 8am" />
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button className="btn-success flex-1" onClick={() => decide('hired')} disabled={!!busy}>{busy === 'hired' && <Spinner className="!text-white" />} Hire</button>
        <button className="btn-ghost flex-1" onClick={() => decide('not_selected')} disabled={!!busy}>{busy === 'not_selected' && <Spinner />} Not selected</button>
      </div>
    </div>
  );
}

export default function ChatRoom({ applicationId, backTo, backLabel }) {
  const { data: app, loading, error, reload } = useFetch(`/chat-jobs/applications/${applicationId}`);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottom = useRef(null);

  const addMessage = useCallback((m) => setMessages((list) => (list.some((x) => x.messageId === m.messageId) ? list : [...list, m])), []);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.get(`/chat-jobs/applications/${applicationId}/messages`);
      setMessages(res.data.data.messages);
    } catch {
      /* the header shows the load error */
    }
  }, [applicationId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  useSocketEvent('chat:message', useCallback((p) => {
    if (String(p.applicationId) !== String(applicationId)) return;
    addMessage(p.message);
    if (p.message.senderRole === 'business') reload(); // the first reply changes the deadlines shown
  }, [applicationId, addMessage, reload]));
  // Refunds and decisions arrive as notifications; refresh the banner when one comes in
  useSocketEvent('notification', reload);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendError('');
    try {
      const res = await api.post(`/chat-jobs/applications/${applicationId}/messages`, { text: body });
      addMessage(res.data.data);
      setText('');
      if (app.viewerRole === 'business' && !app.respondedAt) reload();
    } catch (err) {
      setSendError(errorMessage(err));
      reload(); // the chat may have just closed
    } finally {
      setSending(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!app) return <div className="space-y-4"><ErrorNote message={error} onRetry={reload} /><Link to={backTo} className="btn-ghost">{backLabel}</Link></div>;

  const open = ['pending', 'hired'].includes(app.status);
  const counterpart = app.viewerRole === 'member' ? app.business.name : app.member.username;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600"><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{counterpart}</h1>
            <p className="text-sm text-slate-500">
              {app.business.roleTitle}
              {app.viewerRole === 'admin' && ` · ${app.member.username} ↔ ${app.business.name}`}
              {app.business.payInfo && ` · ${app.business.payInfo}`}
            </p>
          </div>
          <StatusChip status={app.status} label={JOB_STATUS_LABEL[app.status]} />
        </div>
        <StatusBanner app={app} />
        {app.status === 'pending' && app.viewerRole !== 'member' && <DecisionPanel app={app} onDecided={reload} />}
      </section>

      <section className="card flex h-[60vh] min-h-80 flex-col overflow-hidden">
        <ol className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && (
            <li className="py-10 text-center text-sm text-slate-500">
              {app.viewerRole === 'member' ? `Introduce yourself to ${app.business.name}: your experience, languages, and when you can work.` : 'No messages yet.'}
            </li>
          )}
          {messages.map((m) => {
            const mine = m.senderRole === app.viewerRole;
            return (
              <li key={m.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? 'bg-brand-600 text-white' : m.senderRole === 'admin' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-white ring-1 ring-brand-100'}`}>
                  {!mine && <p className="mb-0.5 text-[11px] font-bold opacity-70">{m.senderRole === 'admin' ? 'Admin' : `${m.senderName} · ${ROLE_NAME[m.senderRole]}`}</p>}
                  <p className="whitespace-pre-line break-words">{m.text}</p>
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>{formatDateTime(m.createdAt)}</p>
                </div>
              </li>
            );
          })}
          <li ref={bottom} aria-hidden="true" />
        </ol>
        {open ? (
          <form onSubmit={send} className="border-t border-brand-100 p-3">
            {sendError && <div className="mb-2"><ErrorNote message={sendError} /></div>}
            <div className="flex gap-2">
              <textarea
                className="field min-h-11 flex-1 resize-none"
                rows={1}
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
                placeholder="Type a message…"
                aria-label="Message"
              />
              <button className="btn-primary" disabled={sending || !text.trim()} aria-label="Send">{sending ? <Spinner className="!text-white" /> : <Send className="h-5 w-5" />}</button>
            </div>
          </form>
        ) : (
          <p className="border-t border-brand-100 p-3 text-center text-sm text-slate-500">This chat is closed.</p>
        )}
      </section>
    </div>
  );
}
