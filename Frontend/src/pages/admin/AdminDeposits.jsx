import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocketEvent } from '../../context/LiveContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

function DecisionModal({ deposit, mode, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approve = mode === 'approve';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/deposits/${deposit.transactionId}/${mode}`, approve ? {} : { reason: reason.trim() });
      toast.success(approve ? 'Deposit confirmed' : 'Deposit rejected');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={approve ? 'Confirm deposit' : 'Reject deposit'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-2xl bg-brand-50 p-4 text-sm">
          <b>{deposit.user?.username}</b> says they sent <b>{formatKESShort(deposit.amount)}</b> from <b>{deposit.mpesaPhone}</b> with code <b>{deposit.reference}</b>.
        </p>
        {approve
          ? <p className="text-sm text-slate-600">Only confirm after you find this exact code and amount in the M-Pesa messages or statement. The amount is added to the user's main wallet.</p>
          : <p className="text-sm text-slate-600">Nothing is credited and the user is told the reason.</p>}
        <ErrorNote message={error} />
        {!approve && (
          <div>
            <label htmlFor="reason" className="label">Reason</label>
            <input id="reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Code not found on statement" minLength={3} maxLength={300} required />
          </div>
        )}
        <button className={approve ? 'btn-success w-full' : 'btn-danger w-full'} disabled={busy}>{busy && <Spinner className="!text-white" />} {approve ? 'Money received, credit wallet' : 'Reject deposit'}</button>
      </form>
    </Modal>
  );
}

const TABS = [['pending', 'Pending'], ['completed', 'Credited'], ['failed', 'Rejected'], ['', 'All']];

export default function AdminDeposits() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/deposits', { page, limit: 20, status: status || undefined, sort: status === 'pending' ? 'createdAt' : undefined });
  useSocketEvent('admin:notification', reload);

  return (
    <div className="space-y-5">
      <PageHeader icon={CreditCard} title="Deposits" subtitle="Match each M-Pesa code against the money received, then confirm. Oldest first." />
      <div className="flex gap-2">
        {TABS.map(([k, label]) => (
          <button key={label} onClick={() => { setParams({ status: k }); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${status === k ? 'bg-brand-nav text-white ring-transparent' : 'bg-white ring-brand-100'}`}>{label}</button>
        ))}
      </div>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-hidden">
        {loading ? <PageLoader /> : data?.deposits.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.deposits.map((d) => (
              <li key={d.transactionId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-bold">{d.user?.username || 'Deleted user'} <span className="font-extrabold text-brand-700">{formatKESShort(d.amount)}</span></p>
                  <p className="text-xs text-slate-500">{d.reference && <>Code <b className="font-mono">{d.reference}</b> · </>}{d.mpesaPhone} · {formatDateTime(d.createdAt)}{d.failureReason && ` · ${d.failureReason}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={d.status} label={d.status === 'completed' ? 'credited' : d.status === 'failed' ? 'rejected' : d.status} />
                  {d.status === 'pending' && (<>
                    <button className="btn-success !px-4 !py-2" onClick={() => setDecision({ d, mode: 'approve' })}>Confirm</button>
                    <button className="btn-danger !px-4 !py-2" onClick={() => setDecision({ d, mode: 'reject' })}>Reject</button>
                  </>)}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={CreditCard} title="Nothing here" text={status === 'pending' ? 'No deposits are waiting for confirmation.' : 'No deposits match this filter.'} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {decision && <DecisionModal deposit={decision.d} mode={decision.mode} onClose={() => setDecision(null)} onDone={() => { setDecision(null); reload(); }} />}
    </div>
  );
}
