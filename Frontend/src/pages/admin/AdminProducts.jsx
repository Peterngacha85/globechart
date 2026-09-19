import { useState } from 'react';
import { Package, Plus } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import api, { errorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Pagination, Spinner, StatusChip } from '../../components/Shared/ui';
import { CATEGORY_LABELS, formatKESShort } from '../../utils/format';

const EMPTY = {
  name: '', description: '', category: 'ebook', price: '', originalPrice: '', image: '', content: '',
  referralLevel1: 10, referralLevel2: 5, referralLevel3: 2, stockQuantity: -1, status: 'active',
};

const toForm = (p) => ({
  name: p.name, description: p.description || '', category: p.category, price: p.price, originalPrice: p.originalPrice || '',
  image: p.image || '', content: p.content || '', referralLevel1: p.commission?.referralLevel1 ?? 0, referralLevel2: p.commission?.referralLevel2 ?? 0,
  referralLevel3: p.commission?.referralLevel3 ?? 0, stockQuantity: p.stockQuantity, status: p.status,
});

function ProductForm({ product, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(product ? toForm(product) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const totalCommission = Number(f.referralLevel1) + Number(f.referralLevel2) + Number(f.referralLevel3);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: f.name.trim(), description: f.description.trim() || undefined, category: f.category, price: Number(f.price),
      originalPrice: f.originalPrice ? Number(f.originalPrice) : undefined, image: f.image.trim() || undefined, content: f.content.trim() || undefined,
      commission: { referralLevel1: Number(f.referralLevel1), referralLevel2: Number(f.referralLevel2), referralLevel3: Number(f.referralLevel3) },
      stockQuantity: Number(f.stockQuantity), status: f.status,
    };
    try {
      if (product) await api.put(`/admin/products/${product.productId}`, body);
      else await api.post('/admin/products', body);
      toast.success(product ? 'Product updated' : 'Product created');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <div><label className="label">Name</label><input className="field" value={f.name} onChange={set('name')} required maxLength={120} /></div>
        <div><label className="label">Description</label><textarea className="field" rows={3} value={f.description} onChange={set('description')} maxLength={4000} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Category</label>
            <select className="field" value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">Status</label>
            <select className="field" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>
          <div><label className="label">Price (Ksh)</label><input className="field" type="number" min="1" step="any" value={f.price} onChange={set('price')} required /></div>
          <div><label className="label">Original price</label><input className="field" type="number" min="0" step="any" value={f.originalPrice} onChange={set('originalPrice')} placeholder="for discount badge" /></div>
        </div>
        <div><label className="label">Image URL</label><input className="field" type="url" value={f.image} onChange={set('image')} placeholder="https://…" /></div>
        <div><label className="label">Content / download link (buyers only)</label><input className="field" value={f.content} onChange={set('content')} placeholder="https://… link buyers receive" /></div>
        <div>
          <p className="label">Referral commission (% of sale price)</p>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((n) => (
              <div key={n}><label className="text-xs text-slate-500">Level {n}</label><input className="field" type="number" min="0" max="50" step="any" value={f[`referralLevel${n}`]} onChange={set(`referralLevel${n}`)} /></div>
            ))}
          </div>
          <p className={`mt-1 text-xs ${totalCommission > 50 ? 'font-bold text-rose-600' : 'text-slate-500'}`}>Total {totalCommission}% (max 50%)</p>
        </div>
        <div><label className="label">Stock (-1 = unlimited)</label><input className="field" type="number" min="-1" step="1" value={f.stockQuantity} onChange={set('stockQuantity')} /></div>
        <button className="btn-primary w-full" disabled={busy || totalCommission > 50}>{busy && <Spinner className="!text-white" />} {product ? 'Save changes' : 'Create product'}</button>
      </form>
    </Modal>
  );
}

export default function AdminProducts() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const { data, loading, error, reload } = useFetch('/admin/products', { page, limit: 20 });

  const archive = async (p) => {
    if (!window.confirm(`Archive "${p.name}"? It disappears from the store; past purchases stay intact.`)) return;
    try {
      await api.delete(`/admin/products/${p.productId}`);
      toast.success('Product archived');
      reload();
    } catch (err) {
      toast.error('Could not archive', errorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={Package} title="Products" subtitle="Manage the digital store." action={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New product</button>} />
      <ErrorNote message={error} onRetry={reload} />
      <section className="card overflow-x-auto">
        {loading ? <PageLoader /> : data?.products.length ? (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-brand-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Category', 'Price', 'Sold', 'Commission', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-brand-100/70">
              {data.products.map((p) => (
                <tr key={p.productId}>
                  <td className="px-4 py-3 font-bold">{p.name}</td>
                  <td className="px-4 py-3">{CATEGORY_LABELS[p.category]}</td>
                  <td className="px-4 py-3">{formatKESShort(p.price)}{p.discount > 0 && <span className="ml-1 text-xs text-amber-600">-{p.discount}%</span>}</td>
                  <td className="px-4 py-3">{p.sold}</td>
                  <td className="px-4 py-3 text-xs">{p.commission.referralLevel1}/{p.commission.referralLevel2}/{p.commission.referralLevel3}%</td>
                  <td className="px-4 py-3"><StatusChip status={p.status} /></td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <button className="font-bold text-brand-600 hover:underline" onClick={() => setEditing(p)}>Edit</button>
                    {p.status !== 'archived' && <button className="font-bold text-rose-600 hover:underline" onClick={() => archive(p)}>Archive</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Package} title="No products yet" text="Create your first product to open the store." action={<button className="btn-primary" onClick={() => setEditing('new')}>New product</button>} />}
        <Pagination page={page} totalPages={data?.totalPages} onChange={setPage} />
      </section>
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
