import { Navigate, Route, Routes } from 'react-router-dom';
import { useSite } from './context/SiteContext';
import { PageLoader } from './components/Shared/ui';
import ComingSoonPage from './pages/ComingSoonPage';
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
import HotelsPage from './pages/user/HotelsPage';
import HotelPage from './pages/user/HotelPage';
import JobsPage, { MemberChatPage } from './pages/user/JobsPage';
import BusinessInbox, { BusinessChatPage } from './pages/business/BusinessInbox';
import AdminChatJobs, { AdminChatPage } from './pages/admin/AdminChatJobs';
import SpinPage from './pages/user/SpinPage';
import AdminSpin from './pages/admin/AdminSpin';
import TrainingPage from './pages/user/TrainingPage';
import AdminTrainings from './pages/admin/AdminTrainings';
import VerifyCertificatePage from './pages/VerifyCertificatePage';
import RechargePage from './pages/user/RechargePage';
import WithdrawPage from './pages/user/WithdrawPage';
import HistoryPage from './pages/user/HistoryPage';
import ProfilePage from './pages/user/ProfilePage';
import NotificationsPage from './pages/user/NotificationsPage';
import AdminOverview from './pages/admin/AdminOverview';
import AdminUsers from './pages/admin/AdminUsers';
import AdminWithdrawals from './pages/admin/AdminWithdrawals';
import AdminDeposits from './pages/admin/AdminDeposits';
import AdminProducts from './pages/admin/AdminProducts';
import AdminHotels from './pages/admin/AdminHotels';
import AdminSettings from './pages/admin/AdminSettings';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const site = useSite();

  if (site.loading) return <PageLoader />;
  // COMING_SOON=ON in the backend .env: the whole site is this one page, whatever the address or account
  if (site.comingSoon) return <ComingSoonPage launchDate={site.launchDate} />;

  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<Login admin />} />
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
          <Route path="hotels" element={<HotelsPage />} />
          <Route path="hotels/:id" element={<HotelPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/chat/:id" element={<MemberChatPage />} />
          <Route path="spin" element={<SpinPage />} />
          <Route path="training" element={<TrainingPage key="ai_prompt" program="ai_prompt" />} />
          <Route path="y99" element={<TrainingPage key="y99" program="y99" />} />
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
          <Route path="deposits" element={<AdminDeposits />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="hotels" element={<AdminHotels />} />
          <Route path="chat-jobs" element={<AdminChatJobs />} />
          <Route path="chat-jobs/chat/:id" element={<AdminChatPage />} />
          <Route path="spin" element={<AdminSpin />} />
          <Route path="training" element={<AdminTrainings />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute area="business" />}>
        <Route path="/business" element={<Layout business />}>
          <Route index element={<BusinessInbox />} />
          <Route path="chats/:id" element={<BusinessChatPage />} />
        </Route>
      </Route>

      {/* Public: certificate verification for employers, no account needed */}
      <Route path="/verify/:code" element={<VerifyCertificatePage />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
