import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homePath, useAuth } from '../context/AuthContext';
import { PageLoader } from './Shared/ui';

// area: 'member' (/dashboard), 'business' (/business) or 'admin' (/admin). The admin may also use the member area.
export default function ProtectedRoute({ adminOnly = false, area = adminOnly ? 'admin' : 'member' }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to={area === 'admin' ? '/admin/login' : '/login'} replace state={{ from: location.pathname }} />;
  const role = user.role;
  const allowed =
    area === 'admin' ? role === 'super_admin' : area === 'business' ? role === 'business' : role === 'user' || role === 'super_admin';
  if (!allowed) return <Navigate to={homePath(role)} replace />;
  return <Outlet />;
}

// Login/register pages bounce signed-in users to their home
export function GuestRoute() {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={homePath(user.role)} replace />;
  return <Outlet />;
}
