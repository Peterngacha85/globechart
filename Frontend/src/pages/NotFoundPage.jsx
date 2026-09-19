import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <Compass className="mx-auto h-14 w-14 text-brand-500" />
        <h1 className="mt-4 text-3xl font-extrabold">Page not found</h1>
        <p className="mt-2 text-slate-500">The page you're looking for doesn't exist or has moved.</p>
        <Link to="/dashboard" className="btn-primary mt-6">Go to dashboard</Link>
      </div>
    </div>
  );
}
