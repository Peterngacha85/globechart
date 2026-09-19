import api from './api';
import tokenStorage from './tokenStorage';

const authService = {
  async login(username, password, rememberMe = false) {
    const { data } = await api.post('/auth/login', { username, password, rememberMe });
    tokenStorage.set({ accessToken: data.data.token, refreshToken: data.data.refreshToken }, rememberMe);
    return data.data;
  },

  async register(form) {
    const { data } = await api.post('/auth/register', form);
    tokenStorage.set({ accessToken: data.data.token, refreshToken: data.data.refreshToken }, true);
    return data.data;
  },

  logout() {
    api.post('/auth/logout').catch(() => {});
    tokenStorage.clear();
  },

  hasSession: () => !!tokenStorage.get('accessToken'),
  getToken: () => tokenStorage.get('accessToken'),

  async getProfile() {
    const { data } = await api.get('/users/profile');
    return data.data;
  },

  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post(`/auth/reset-password/${token}`, { newPassword }),
};

export default authService;
