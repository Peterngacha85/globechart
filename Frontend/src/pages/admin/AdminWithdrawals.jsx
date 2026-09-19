import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocketEvent } from '../../context/LiveContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

function DecisionModal({ withdrawal, mode, onClose, onDone }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approve = mode === 'approve';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/withdrawals/${withdrawal.withdrawalId}/${mode}`, approve ? { transactionReference: value.trim() } : { reason: value.trim() });
      toast.success(approve ? 'Withdrawal approved' : 'Withdrawal rejected');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={approve ? 'Approve withdrawal' : 'Reject withdrawal'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-2xl bg-brand-50 p-4 text-sm">
          <b>{withdrawal.user?.username}</b> requested <b>{formatKESShort(withdrawal.amount)}</b> to <b>{withdrawal.mpesaPhone}</b>.
        </p>
        {approve && <p className="text-sm text-slate-600">Send the money via M-Pesa first, then paste the M-Pesa transaction code here to confirm.</p>}
        {!approve && <p className="text-sm text-slate-600">The amount is returned to the user's commission wallet and they are told the reason.</p>}
        <ErrorNote message={error} />
        <div>
          <label htmlFor="v" className="label">{approve ? 'M-Pesa transaction code' : 'Reason'}</label>
          <input id="v" className="field" value={value} onChange={(e) => setValue(e.target.value)} placeholder={approve ? 'e.g. QGH123ABC4' : 'e.g. Phone number mismatch'} minLength={3} maxLength={approve ? 40 : 300} required />
        </div>
        <button className={approve ? 'btn-success w-full' : 'btn-danger w-full'} disabled={busy}>{busy && <Spinner className="!text-white" />} {approve ? 'Confirm payout sent' : 'Reject and refund'}</button>
      </form>
    </Modal>
  );
}

const TABS = [['pending', 'Pending'], ['approved', 'Paid'], ['rejected', 'Rejected'], ['', 'All']];

export default function AdminWithdrawals() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState(null);
  const { data, loading, error, reload } = useFetch('/admin/withdrawals', { page, limit: 20, status: status || undefined, sort: status === 'pending' ? 'requestedAt' : undefined });
  useSocketEvent('admin:notification', reload);

  return (
    <div className="space-y-5">
      <PageHeader icon={Wallet} title="Withdrawals" subtitle="Pay out via M-Pesa, then confirm here. Oldest requests first." />
      <div className="flex gap-2">
        {TABS.map(([k, label]) => (
          <button key={label} onClick={() => { setParams(k ? { status: k } : { status: '' }); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${status === k ? 'bg-brand-nav text-white ring-transparent' : 'bg-white ring-brand-100'}`}>{label}</button>
        ))}
      </div>
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-hidden">
        {loading ? <PageLoader /> : data?.withdrawals.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.withdrawals.map((w) => (
              <li key={w.withdrawalId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-bold">{w.user?.username || 'Deleted user'} <span className="font-extrabold text-brand-700">{formatKESShort(w.amount)}</span></p>
                  <p className="text-xs text-slate-500">{w.mpesaPhone} · {formatDateTime(w.requestedAt)}{w.transactionReference && ` · Ref ${w.transactionReference}`}{w.rejectionReason && ` · ${w.rejectionReason}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={w.status} label={w.status === 'approved' ? 'paid' : w.status} />
                  {w.status === 'pending' && (<>
                    <button className="btn-success !px-4 !py-2" onClick={() => setDecision({ w, mode: 'approve' })}>Approve</button>
                    <button className="btn-danger !px-4 !py-2" onClick={() => setDecision({ w, mode: 'reject' })}>Reject</button>
                  </>)}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Wallet} title="Nothing here" text={status === 'pending' ? 'No withdrawals are waiting for approval.' : 'No withdrawals match this filter.'} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {decision && <DecisionModal withdrawal={decision.w} mode={decision.mode} onClose={() => setDecision(null)} onDone={() => { setDecision(null); reload(); }} />}
    </div>
  );
}
