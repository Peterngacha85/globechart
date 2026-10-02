import axios from 'axios';
import tokenStorage from './tokenStorage';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  const token = tokenStorage.get('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// One refresh at a time, shared by every request that hits a 401 at the same moment
let refreshing = null;
const refreshAccessToken = () => {
  if (!refreshing) {
    const refreshToken = tokenStorage.get('refreshToken');
    refreshing = axios
      .post(`${API_URL}/auth/refresh-token`, { refreshToken })
      .then((res) => {
        tokenStorage.updateAccess(res.data.data.token);
        return res.data.data.token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 503 && error.response.data?.comingSoon) {
      window.dispatchEvent(new Event('site:coming-soon'));
      return Promise.reject(error);
    }
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall && tokenStorage.get('refreshToken')) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        tokenStorage.clear();
        window.dispatchEvent(new Event('auth:expired'));
      }
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.errors?.[0]?.message || err?.response?.data?.message || (err?.request ? 'Cannot reach the server. Check your connection.' : fallback);

export default api;
