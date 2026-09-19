import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import authService from '../services/authService';
import socketService from '../services/socketService';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const LiveContext = createContext(null);

// Owns the socket connection and the unread-notification counter
export function LiveProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const userId = user?.userId;

  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { limit: 1 } });
      setUnread(data.data.unreadCount);
    } catch {
      /* the badge is cosmetic */
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      socketService.disconnect();
      setUnread(0);
      return undefined;
    }
    socketService.connect(authService.getToken());
    refreshUnread();

    const offNotification = socketService.on('notification', (n) => {
      setUnread((c) => c + 1);
      toast.push({ title: n.title, message: n.message, type: n.type });
    });
    const offBalance = socketService.on('balance:updated', () => refreshUser().catch(() => {}));
    return () => {
      offNotification();
      offBalance();
      socketService.disconnect();
    };
  }, [userId, refreshUnread, refreshUser, toast]);

  const value = useMemo(() => ({ unread, setUnread, refreshUnread }), [unread, refreshUnread]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Subscribe a component to a socket event for as long as it is mounted
export function useSocketEvent(event, handler) {
  useEffect(() => socketService.on(event, handler), [event, handler]);
}
