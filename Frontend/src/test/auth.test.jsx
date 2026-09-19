import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'error',
  API_URL: 'http://test/api',
}));
vi.mock('../services/socketService', () => ({ default: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(() => () => {}) } }));

import api from '../services/api';
import tokenStorage from '../services/tokenStorage';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { LiveProvider } from '../context/LiveContext';
import ProtectedRoute, { GuestRoute } from '../components/ProtectedRoute';
import Login from '../components/Auth/Login';
import Register from '../components/Auth/Register';

const profile = (over = {}) => ({
  userId: 'u1', username: 'alice', role: 'user', status: 'active', referralCode: 'ABCD2345',
  mainWallet: { balance: 0 }, commissionWallet: { balance: 0, totalEarned: 0 }, ...over,
});

const renderApp = (initial, extra = null) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <LiveProvider>
            <Routes>
              <Route element={<GuestRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<p>member home</p>} />
              </Route>
              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/admin" element={<p>admin home</p>} />
              </Route>
              {extra}
            </Routes>
          </LiveProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  tokenStorage.clear();
  api.get.mockImplementation((url) => (url === '/notifications' ? Promise.resolve({ data: { data: { unreadCount: 0 } } }) : Promise.reject(new Error('unmocked ' + url))));
});

describe('route guards', () => {
  test('signed-out visitors are sent to the login page', async () => {
    renderApp('/dashboard');
    expect(await screen.findByText(/use your/i)).toBeInTheDocument();
  });

  test('a regular member cannot open the admin area', async () => {
    tokenStorage.set({ accessToken: 't', refreshToken: 'r' }, true);
    api.get.mockImplementation((url) => (url === '/users/profile' ? Promise.resolve({ data: { data: profile() } }) : Promise.resolve({ data: { data: { unreadCount: 0 } } })));
    renderApp('/admin');
    expect(await screen.findByText('member home')).toBeInTheDocument();
    expect(screen.queryByText('admin home')).not.toBeInTheDocument();
  });

  test('the admin can open the admin area', async () => {
    tokenStorage.set({ accessToken: 't', refreshToken: 'r' }, true);
    api.get.mockImplementation((url) => (url === '/users/profile' ? Promise.resolve({ data: { data: profile({ role: 'super_admin' }) } }) : Promise.resolve({ data: { data: { unreadCount: 0 } } })));
    renderApp('/admin');
    expect(await screen.findByText('admin home')).toBeInTheDocument();
  });
});

describe('login', () => {
  test('signs in and lands on the dashboard', async () => {
    api.post.mockResolvedValue({ data: { data: { token: 'a', refreshToken: 'b' } } });
    api.get.mockImplementation((url) => (url === '/users/profile' ? Promise.resolve({ data: { data: profile() } }) : Promise.resolve({ data: { data: { unreadCount: 0 } } })));
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText(/username/i), 'alice');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('member home')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'alice', password: 'secret123', rememberMe: false });
  });

  test('shows the server message when credentials are wrong', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Invalid username or password' } } });
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText(/username/i), 'alice');
    await user.type(screen.getByLabelText(/^password/i), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
  });
});

describe('registration', () => {
  test('shows who invited you and sends the referral code with the form', async () => {
    api.post.mockResolvedValue({ data: { data: { token: 'a', refreshToken: 'b' } } });
    api.get.mockImplementation((url) => (url === '/users/profile' ? Promise.resolve({ data: { data: profile() } }) : Promise.resolve({ data: { data: { unreadCount: 0 } } })));
    const user = userEvent.setup();
    renderApp('/register?ref=zipp');

    expect(screen.getByText('zipp')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/username/i), 'newbie');
    await user.type(screen.getByLabelText(/phone/i), '0712345678');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe('/auth/register');
    expect(api.post.mock.calls[0][1]).toMatchObject({ username: 'newbie', phone: '0712345678', referralCode: 'zipp', agreeTerms: true });
    expect(await screen.findByText('member home')).toBeInTheDocument();
  });

  test('does not submit until the terms are accepted', async () => {
    const user = userEvent.setup();
    renderApp('/register');
    await user.type(screen.getByLabelText(/username/i), 'newbie');
    await user.type(screen.getByLabelText(/phone/i), '0712345678');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(api.post).not.toHaveBeenCalled();
  });
});
