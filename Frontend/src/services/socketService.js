import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Thin wrapper: one authenticated connection, listeners that survive reconnects
class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map(); // event -> Set<callback>
  }

  connect(token) {
    this.disconnect();
    this.socket = io(SOCKET_URL, { auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
    this.listeners.forEach((set, event) => set.forEach((cb) => this.socket.on(event, cb)));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  // Returns an unsubscribe function
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    this.socket?.on(event, callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
      this.socket?.off(event, callback);
    };
  }
}

export default new SocketService();
