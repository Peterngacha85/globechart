# GLOBECHART - WebSocket Real-time Features

## Overview
Socket.io implementation for real-time notifications, instant updates, and live features without page refresh.

---

## 1. BACKEND SOCKET.IO SETUP

### Install Dependencies
```bash
cd backend
npm install socket.io socket.io-client redis ioredis
```

### Socket.io Server Configuration

```javascript
// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// CORS middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', require('./routes'));

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join user's personal room
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined personal room`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Make io accessible in routes
app.locals.io = io;

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };
```

---

## 2. NOTIFICATION EMITTER UTILITY

### Centralized Notification Handler

```javascript
// backend/utils/notificationEmitter.js
const Notification = require('../models/Notification');

class NotificationEmitter {
  constructor(io) {
    this.io = io;
  }

  // Emit notification to user
  async notifyUser(userId, notification) {
    try {
      // Save to database
      const savedNotification = await Notification.create({
        user: userId,
        ...notification
      });

      // Emit via socket
      this.io.to(`user:${userId}`).emit('notification', {
        notificationId: savedNotification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        category: notification.category,
        createdAt: savedNotification.createdAt
      });

      return savedNotification;
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  // Emit to multiple users
  async notifyMultipleUsers(userIds, notification) {
    return Promise.all(
      userIds.map(userId => this.notifyUser(userId, notification))
    );
  }

  // Broadcast to all admins
  async notifyAdmins(notification) {
    this.io.emit('admin:notification', notification);
  }

  // Real-time balance update
  emitBalanceUpdate(userId, newBalance) {
    this.io.to(`user:${userId}`).emit('balance:updated', {
      newBalance,
      timestamp: new Date()
    });
  }

  // Real-time commission update
  emitCommissionUpdate(userId, commission) {
    this.io.to(`user:${userId}`).emit('commission:earned', {
      amount: commission.amount,
      type: commission.commissionType,
      from: commission.earnedFrom,
      timestamp: new Date()
    });
  }

  // Withdrawal status update
  emitWithdrawalUpdate(userId, withdrawal) {
    this.io.to(`user:${userId}`).emit('withdrawal:updated', {
      withdrawalId: withdrawal._id,
      status: withdrawal.status,
      amount: withdrawal.amount,
      timestamp: new Date()
    });
  }

  // Tournament updates
  broadcastTournamentUpdate(update) {
    this.io.emit('tournament:updated', update);
  }

  // Game result
  emitGameResult(userId, result) {
    this.io.to(`user:${userId}`).emit('game:result', result);
  }
}

module.exports = NotificationEmitter;
```

---

## 3. EMIT NOTIFICATIONS FROM ROUTES

### Example: Commission Notification

```javascript
// backend/controllers/financeController.js
const NotificationEmitter = require('../utils/notificationEmitter');

exports.processWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.create(req.body);
    
    const io = req.app.locals.io;
    const notifier = new NotificationEmitter(io);

    // Notify user
    await notifier.notifyUser(withdrawal.user, {
      title: 'Withdrawal Submitted',
      message: `Your withdrawal request of Ksh ${withdrawal.amount} has been submitted`,
      type: 'success',
      category: 'withdrawal',
      relatedData: { withdrawalId: withdrawal._id }
    });

    // Notify admins
    await notifier.notifyAdmins({
      title: 'New Withdrawal Request',
      message: `User requested withdrawal of Ksh ${withdrawal.amount}`,
      action: `/admin/withdrawals/${withdrawal._id}`
    });

    res.status(201).json({ success: true, data: withdrawal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

### Example: Commission Earned

```javascript
// backend/controllers/commissionController.js
exports.creditCommission = async (req, res) => {
  try {
    const commission = await Commission.create(req.body);
    
    const io = req.app.locals.io;
    const notifier = new NotificationEmitter(io);

    // Update user's commission balance
    await User.findByIdAndUpdate(commission.user, {
      $inc: { 'earnings.affiliate': commission.amount }
    });

    // Notify user via websocket
    notifier.emitCommissionUpdate(commission.user, commission);

    // Also create notification
    await notifier.notifyUser(commission.user, {
      title: 'Commission Earned!',
      message: `You earned Ksh ${commission.amount} from referral sale`,
      type: 'earnings',
      category: 'commission'
    });

    res.json({ success: true, data: commission });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

## 4. FRONTEND SOCKET.IO SETUP

### Install Dependencies
```bash
cd frontend
npm install socket.io-client
```

### Socket Service

```javascript
// frontend/src/services/socketService.js
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect(userId) {
    this.socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      // Join user's room
      this.socket.emit('join', userId);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Listen for notifications
  onNotification(callback) {
    this.socket?.on('notification', callback);
  }

  // Listen for balance updates
  onBalanceUpdate(callback) {
    this.socket?.on('balance:updated', callback);
  }

  // Listen for commission updates
  onCommissionUpdate(callback) {
    this.socket?.on('commission:earned', callback);
  }

  // Listen for withdrawal updates
  onWithdrawalUpdate(callback) {
    this.socket?.on('withdrawal:updated', callback);
  }

  // Listen for game results
  onGameResult(callback) {
    this.socket?.on('game:result', callback);
  }

  // Listen for tournament updates
  onTournamentUpdate(callback) {
    this.socket?.on('tournament:updated', callback);
  }

  // Emit events
  emit(event, data) {
    this.socket?.emit(event, data);
  }

  // Remove listeners
  off(event) {
    this.socket?.off(event);
  }
}

export default new SocketService();
```

---

## 5. SOCKET CONTEXT PROVIDER

### React Socket Context

```javascript
// frontend/src/context/SocketContext.jsx
import React, { createContext, useEffect, useCallback } from 'react';
import socketService from '../services/socketService';
import { useAuth } from '../hooks/useAuth';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.userId) {
      socketService.connect(user.userId);

      return () => {
        socketService.disconnect();
      };
    }
  }, [user?.userId]);

  const value = {
    socket: socketService.socket,
    emit: useCallback((event, data) => socketService.emit(event, data), []),
    on: useCallback((event, callback) => {
      socketService.socket?.on(event, callback);
    }, []),
    off: useCallback((event) => socketService.off(event), [])
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
```

---

## 6. SOCKET HOOK

### Custom Hook for Socket Events

```javascript
// frontend/src/hooks/useSocket.js
import { useContext, useEffect, useCallback } from 'react';
import { SocketContext } from '../context/SocketContext';

export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }

  return context;
};

// Example usage hook for specific events
export const useNotifications = () => {
  const { on, off } = useSocket();
  const [notifications, setNotifications] = React.useState([]);

  useEffect(() => {
    const handleNotification = (notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 10));
    };

    on('notification', handleNotification);

    return () => {
      off('notification');
    };
  }, [on, off]);

  return notifications;
};
```

---

## 7. NOTIFICATION COMPONENT

### React Notification Toast

```javascript
// frontend/src/components/NotificationToast.jsx
import React, { useEffect, useState } from 'react';
import { useNotifications } from '../hooks/useSocket';

const NotificationToast = () => {
  const notifications = useNotifications();
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    if (notifications.length > 0) {
      const lastNotif = notifications[0];
      setVisible(prev => [...prev, lastNotif]);

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setVisible(prev => prev.slice(1));
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notifications]);

  return (
    <div className="fixed top-4 right-4 space-y-2 z-50">
      {visible.map((notif, index) => (
        <div
          key={index}
          className={`p-4 rounded-lg text-white shadow-lg animate-slide-in ${
            notif.type === 'success' ? 'bg-green-500' :
            notif.type === 'error' ? 'bg-red-500' :
            notif.type === 'warning' ? 'bg-yellow-500' :
            'bg-blue-500'
          }`}
        >
          <h4 className="font-semibold">{notif.title}</h4>
          <p className="text-sm">{notif.message}</p>
        </div>
      ))}
    </div>
  );
};

export default NotificationToast;
```

---

## 8. REAL-TIME BALANCE UPDATES

### Dashboard with Live Balance

```javascript
// frontend/src/components/Dashboard/BalanceCard.jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../hooks/useAuth';

const BalanceCard = ({ initialBalance }) => {
  const { user } = useAuth();
  const { on, off } = useSocket();
  const [balance, setBalance] = useState(initialBalance);

  useEffect(() => {
    const handleBalanceUpdate = (data) => {
      setBalance(data.newBalance);
      // Optional: show toast notification
    };

    on('balance:updated', handleBalanceUpdate);

    return () => {
      off('balance:updated');
    };
  }, [on, off]);

  return (
    <div className="bg-gradient-to-r from-green-400 to-green-600 rounded-lg p-6 text-white">
      <h3 className="text-sm opacity-90">Available Balance</h3>
      <p className="text-4xl font-bold mt-2">Ksh {balance.toLocaleString()}</p>
      <p className="text-xs opacity-75 mt-1">Withdrawable via M-Pesa</p>
    </div>
  );
};

export default BalanceCard;
```

---

## 9. REAL-TIME EARNINGS TICKER

### Live Commission Display

```javascript
// frontend/src/components/Dashboard/EarningsTicker.jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';

const EarningsTicker = ({ onEarnings }) => {
  const { on, off } = useSocket();
  const [recentEarnings, setRecentEarnings] = useState([]);

  useEffect(() => {
    const handleCommission = (data) => {
      const earning = {
        id: Date.now(),
        amount: data.amount,
        type: data.type,
        timestamp: data.timestamp
      };

      setRecentEarnings(prev => [earning, ...prev].slice(0, 5));
      
      if (onEarnings) {
        onEarnings(earning);
      }
    };

    on('commission:earned', handleCommission);

    return () => {
      off('commission:earned');
    };
  }, [on, off, onEarnings]);

  return (
    <div className="space-y-2">
      {recentEarnings.map(earning => (
        <div
          key={earning.id}
          className="flex justify-between items-center p-3 bg-yellow-50 rounded border border-yellow-200"
        >
          <span className="text-sm font-medium text-gray-700">
            +Ksh {earning.amount}
          </span>
          <span className="text-xs text-gray-500">
            {earning.type}
          </span>
        </div>
      ))}
    </div>
  );
};

export default EarningsTicker;
```

---

## 10. TOURNAMENT LIVE UPDATES

### Real-time Tournament Leaderboard

```javascript
// frontend/src/components/Tournament/LiveLeaderboard.jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';

const LiveLeaderboard = ({ tournamentId }) => {
  const { on, off } = useSocket();
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const handleUpdate = (data) => {
      if (data.tournamentId === tournamentId) {
        setLeaderboard(data.leaderboard);
      }
    };

    on('tournament:updated', handleUpdate);

    return () => {
      off('tournament:updated');
    };
  }, [tournamentId, on, off]);

  return (
    <div className="bg-white rounded-lg p-6">
      <h2 className="text-2xl font-bold text-purple-600 mb-4">Live Rankings</h2>
      <div className="space-y-2">
        {leaderboard.map((entry, index) => (
          <div
            key={index}
            className="flex justify-between items-center p-3 bg-gray-50 rounded"
          >
            <span className="font-semibold">
              {index + 1}. {entry.username}
            </span>
            <span className="text-purple-600 font-bold">
              {entry.referrals} refs
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveLeaderboard;
```

---

## 11. SOCKET EVENTS REFERENCE

### Event Types

```javascript
// Client → Server
'join' - User joins personal room
'leave' - User leaves
'message' - Send message
'game:spin' - Start spin game

// Server → Client (Broadcast)
'notification' - New notification
'balance:updated' - Balance changed
'commission:earned' - Commission credited
'withdrawal:updated' - Withdrawal status change
'game:result' - Game outcome
'tournament:updated' - Tournament changes
'admin:notification' - Admin alerts
```

---

## 12. DEPLOYMENT CONSIDERATIONS

### Production Socket.io Setup

```javascript
// backend/config/socket.js
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Server } = require('socket.io');

module.exports = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true
    },
    adapter: process.env.REDIS_URL
      ? createAdapter(
          redis.createClient({ url: process.env.REDIS_URL }),
          redis.createClient({ url: process.env.REDIS_URL })
        )
      : undefined
  });

  return io;
};
```

### Environment Variables
```env
# .env (backend)
SOCKET_URL=https://api.globechart.com
SOCKET_CORS=https://globechart.com
REDIS_URL=redis://:password@redis-host:6379

# .env.local (frontend)
VITE_SOCKET_URL=https://api.globechart.com
```

---

## 13. TESTING SOCKET CONNECTIONS

### Test Socket Events

```javascript
// Test script: backend/tests/socket.test.js
const io = require('socket.io-client');

const socket = io('http://localhost:5000', {
  reconnection: true
});

socket.on('connect', () => {
  console.log('✓ Connected');
  socket.emit('join', 'test-user-id');
});

socket.on('notification', (data) => {
  console.log('✓ Received notification:', data);
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected');
});

// Simulate notification
setTimeout(() => {
  socket.emit('test:notification', { message: 'Test' });
}, 2000);
```

---

## 14. MONITORING & DEBUGGING

### Socket.io Admin Dashboard

```bash
# Install Socket.io admin UI
npm install @socket.io/admin-ui

# Access at: http://localhost:5000/admin/
```

```javascript
// backend/server.js
const { instrument } = require('@socket.io/admin-ui');

instrument(io, {
  auth: false,  // Set to true in production with authentication
  mode: 'development'
});
```

---

**Next**: Deploy and test the full system

**Created by**: Peter Ngacha / Fastweb Technologies  
**Last Updated**: September 2026
