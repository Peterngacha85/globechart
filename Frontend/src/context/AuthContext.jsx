import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import authService from '../services/authService';
import tokenStorage from '../services/tokenStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(authService.hasSession());

  const refreshUser = useCallback(async () => {
    const profile = await authService.getProfile();
    setUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    if (!authService.hasSession()) return undefined;
    let cancelled = false;
    refreshUser()
      .catch(() => tokenStorage.clear())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Fired by the API client when a session can no longer be refreshed
  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener('auth:expired', expire);
    return () => window.removeEventListener('auth:expired', expire);
  }, []);

  const login = useCallback(async (username, password, rememberMe) => {
    await authService.login(username, password, rememberMe);
    return refreshUser();
  }, [refreshUser]);

  const register = useCallback(async (form) => {
    await authService.register(form);
    return refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, isAdmin: user?.role === 'super_admin', login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
