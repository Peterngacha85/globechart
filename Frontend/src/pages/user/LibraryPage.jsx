import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, PackageOpen, ShoppingBag } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { EmptyState, ErrorNote, PageHeader, PageLoader, Pagination, Spinner, StatTile } from '../../components/Shared/ui';
import { CATEGORY_LABELS, formatDate, formatKESShort } from '../../utils/format';

export default function LibraryPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState('');
  const { data, loading, error, reload } = useFetch('/products/my-library', { page, limit: 10 });

  const open = async (productId) => {
    setOpening(productId);
    try {
      const { data: res } = await api.get(`/products/${productId}/access`);
      const target = res.data.content || '';
      if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener');
      else toast.push({ title: res.data.name, message: target || 'No content attached yet. Contact support.', type: 'info', duration: 9000 });
    } catch (err) {
      toast.error('Could not open product', errorMessage(err));
    } finally {
      setOpening('');
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <PageHeader icon={PackageOpen} title="Your digital collection" subtitle="All your purchased products in one place."
        action={<Link to="/dashboard/store" className="btn-ghost"><ShoppingBag className="h-4 w-4" /> Browse Store</Link>} />
      <ErrorNote message={error} onRetry={reload} />
      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Owned" value={data?.owned ?? 0} />
        <StatTile label="Spent" value={formatKESShort(data?.totalSpent)} />
      </div>
      <section className="card overflow-hidden">
        {data?.purchases?.length ? (
          <ul className="divide-y divide-brand-100/70">
            {data.purchases.map((p) => (
              <li key={p.purchaseId} className="flex items-center gap-4 p-4">
                {p.product?.image ? <img src={p.product.image} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-100 text-brand-600"><PackageOpen className="h-6 w-6" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.product?.name || 'Unavailable product'}</p>
                  <p className="text-xs text-slate-500">{CATEGORY_LABELS[p.product?.category]} · {formatKESShort(p.purchasePrice)} · {formatDate(p.purchasedAt)}</p>
                </div>
                <button className="btn-primary !px-4 !py-2" onClick={() => open(p.productId)} disabled={opening === p.productId}>
                  {opening === p.productId ? <Spinner className="!text-white" /> : <ExternalLink className="h-4 w-4" />} Open
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShoppingBag} title="No purchases yet" text="Visit the store to find eBooks, source code, templates and more."
            action={<Link to="/dashboard/store" className="btn-primary">Go to Store</Link>} />
        )}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
    </div>
  );
}
