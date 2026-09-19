import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute';
import Layout from './components/Shared/Layout';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import { ForgotPassword, ResetPassword } from './components/Auth/ForgotPassword';
import DashboardPage from './pages/user/DashboardPage';
import TeamPage from './pages/user/TeamPage';
import LevelsPage from './pages/user/LevelsPage';
import StorePage from './pages/user/StorePage';
import LibraryPage from './pages/user/LibraryPage';
import RechargePage from './pages/user/RechargePage';
import WithdrawPage from './pages/user/WithdrawPage';
import HistoryPage from './pages/user/HistoryPage';
import ProfilePage from './pages/user/ProfilePage';
import NotificationsPage from './pages/user/NotificationsPage';
import AdminOverview from './pages/admin/AdminOverview';
import AdminUsers from './pages/admin/AdminUsers';
import AdminWithdrawals from './pages/admin/AdminWithdrawals';
import AdminProducts from './pages/admin/AdminProducts';
import AdminSettings from './pages/admin/AdminSettings';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="levels" element={<LevelsPage />} />
          <Route path="store" element={<StorePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="recharge" element={<RechargePage />} />
          <Route path="withdraw" element={<WithdrawPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute adminOnly />}>
        <Route path="/admin" element={<Layout admin />}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="withdrawals" element={<AdminWithdrawals />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
