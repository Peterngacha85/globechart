import { useParams } from 'react-router-dom';
import { Award, BadgeCheck, CircleX, Printer } from 'lucide-react';
import useFetch from '../hooks/useFetch';
import { APP_NAME, Logo, PageLoader } from '../components/Shared/ui';
import { formatDate } from '../utils/format';

// Public page: anyone with the code can confirm a certificate. Prints as the certificate itself.
export default function VerifyCertificatePage() {
  const { code } = useParams();
  const { data, loading, error } = useFetch(`/trainings/certificates/${encodeURIComponent(code)}`);

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      {loading ? <PageLoader /> : data ? (
        <div className="w-full max-w-2xl space-y-4">
          <article className="card border-4 border-double border-brand-200 bg-white p-8 text-center sm:p-12">
            <div className="flex items-center justify-center gap-3"><Logo /><span className="text-xl font-extrabold tracking-tight">{APP_NAME.toUpperCase()}</span></div>
            <Award className="mx-auto mt-6 h-14 w-14 text-amber-500" />
            <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.3em] text-brand-600">Certificate of completion</p>
            <p className="mt-6 text-sm text-slate-500">This certifies that</p>
            <p className="mt-1 text-3xl font-extrabold">{data.holder}</p>
            <p className="mt-4 text-sm text-slate-500">attended and completed</p>
            <p className="mt-1 text-xl font-bold">{data.course}</p>
            <p className="mt-2 text-sm text-slate-500">held on {formatDate(data.heldOn)} at {data.venue}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-slate-500">
              <span>Issued {formatDate(data.issuedAt)}</span>
              <span className="font-mono">{data.certificateCode}</span>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm font-bold text-emerald-600"><BadgeCheck className="h-5 w-5" /> Verified genuine</p>
          </article>
          <button className="btn-ghost mx-auto flex print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print or save as PDF</button>
        </div>
      ) : (
        <div className="card max-w-md p-8 text-center">
          <CircleX className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-3 text-xl font-extrabold">Certificate not found</h1>
          <p className="mt-1 text-sm text-slate-500">{error || 'No certificate matches this code.'} Check the code and try again.</p>
        </div>
      )}
    </div>
  );
}
