import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { EmptyState, ErrorNote, PageLoader, Pagination, StatusChip } from '../../components/Shared/ui';
import { formatDateTime, formatKESShort } from '../../utils/format';

const TYPE_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', purchase: 'Purchase', commission: 'Commission', refund: 'Refund' };
const CREDIT_TYPES = ['deposit', 'commission', 'refund'];

function Withdrawals() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useFetch('/finance/withdrawal-history', { page, limit: 10 });
  if (loading) return <PageLoader />;
  return (
    <>
      <ErrorNote message={error} />
      <section className="card relative overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 to-fuchsia-300" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label">Total paid out</p>
            <p className="text-4xl font-extrabold text-emerald-600">{formatKESShort(data?.totalWithdrawn)}</p>
            <p className="text-sm text-slate-500">{data?.counts.approved} paid · {data?.total} total requests</p>
          </div>
          <dl className="w-44 space-y-1 rounded-2xl bg-brand-50 p-3 text-sm">
            {[['Paid', data?.counts.approved, 'text-emerald-600'], ['Pending', data?.counts.pending, 'text-amber-600'], ['Rejected', data?.counts.rejected, 'text-rose-600']].map(([k, v, c]) => (
              <div key={k} className="flex justify-between"><dt>{k}</dt><dd className={`font-bold ${c}`}>{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>
      <Link to="/dashboard/withdraw" className="btn-primary w-fit"><Plus className="h-4 w-4" /> New Withdrawal</Link>
      <section className="card overflow-hidden">
        {data?.withdrawals.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.withdrawals.map((w) => (
              <li key={w.withdrawalId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <p className="font-bold">{formatKESShort(w.amount)} <span className="text-sm font-normal text-slate-500">to {w.mpesaPhone}</span></p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(w.requestedAt)}
                    {w.transactionReference && ` · Ref ${w.transactionReference}`}
                    {w.rejectionReason && ` · ${w.rejectionReason}`}
                  </p>
                </div>
                <StatusChip status={w.status} label={w.status === 'approved' ? 'paid' : w.status} />
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={ReceiptText} title="No withdrawals yet" text="Your withdrawal history will appear here once you make your first request." />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </>
  );
}

function Transactions() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useFetch('/finance/transactions', { page, limit: 15 });
  if (loading) return <PageLoader />;
  return (
    <section className="card overflow-hidden">
      <ErrorNote message={error} />
      {data?.transactions.length ? (
        <ul className="divide-y divide-brand-100/70">
          {data.transactions.map((t) => (
            <li key={t.transactionId} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-bold">{t.description || TYPE_LABEL[t.type]}</p>
                <p className="text-xs text-slate-500">{TYPE_LABEL[t.type]} · {formatDateTime(t.createdAt)}{t.reference && ` · ${t.reference}`}</p>
              </div>
              <div className="text-right">
                <p className={`font-extrabold ${CREDIT_TYPES.includes(t.type) ? 'text-emerald-600' : 'text-ink'}`}>{CREDIT_TYPES.includes(t.type) ? '+' : '−'}{formatKESShort(t.amount)}</p>
                <StatusChip status={t.status} />
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={ReceiptText} title="No transactions yet" text="Deposits, purchases and commissions will show up here." />}
      <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
    </section>
  );
}

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'withdrawals' ? 'withdrawals' : 'transactions';
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {[['transactions', 'Transactions'], ['withdrawals', 'Withdrawals']].map(([key, label]) => (
          <button key={key} onClick={() => setParams({ tab: key })}
            className={`rounded-full px-5 py-2 text-sm font-bold ring-1 ${tab === key ? 'bg-brand-nav text-white ring-transparent shadow-glow' : 'bg-white text-slate-700 ring-brand-100'}`}>{label}</button>
        ))}
      </div>
      {tab === 'withdrawals' ? <Withdrawals /> : <Transactions />}
    </div>
  );
}
