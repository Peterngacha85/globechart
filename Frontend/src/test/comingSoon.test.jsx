import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'error',
  API_URL: 'http://test/api',
}));
vi.mock('../services/socketService', () => ({ default: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(() => () => {}) } }));

import api from '../services/api';
import tokenStorage from '../services/tokenStorage';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { LiveProvider } from '../context/LiveContext';
import { SiteProvider } from '../context/SiteContext';

const respond = (site) =>
  api.get.mockImplementation((url) => {
    if (url === '/site') return Promise.resolve({ data: { data: site } });
    if (url === '/notifications') return Promise.resolve({ data: { data: { unreadCount: 0 } } });
    return Promise.reject(new Error(`unmocked ${url}`));
  });

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SiteProvider>
          <AuthProvider>
            <LiveProvider>
              <App />
            </LiveProvider>
          </AuthProvider>
        </SiteProvider>
      </ToastProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  tokenStorage.clear();
});

describe('coming soon mode', () => {
  test('shows the launch page with what is coming and a countdown', async () => {
    respond({ comingSoon: true, launchDate: new Date(Date.now() + 3 * 86400000).toISOString() });
    renderAt('/register');
    expect(await screen.findByRole('heading', { name: /something big is coming/i })).toBeInTheDocument();
    expect(screen.getByText('Hotel Reviews')).toBeInTheDocument();
    expect(screen.getByText('Y99 Earn Program')).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();
  });

  test('every address shows only the launch page, the admin pages included', async () => {
    respond({ comingSoon: true, launchDate: null });
    for (const path of ['/admin/login', '/admin', '/dashboard', '/verify/GC-ABC']) {
      const { unmount } = renderAt(path);
      expect(await screen.findByRole('heading', { name: /something big is coming/i })).toBeInTheDocument();
      expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  test('when the mode is off, the normal sign-in page shows', async () => {
    respond({ comingSoon: false, launchDate: null });
    renderAt('/login');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/something big is coming/i)).not.toBeInTheDocument();
  });
});
