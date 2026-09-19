const Notification = require('../models/Notification');

// Persists a notification and pushes it to the user's socket room
class NotificationEmitter {
  constructor(io) {
    this.io = io;
  }

  async notifyUser(userId, notification) {
    const saved = await Notification.create({ user: userId, ...notification });
    this.io?.to(`user:${userId}`).emit('notification', {
      notificationId: saved._id,
      title: saved.title,
      message: saved.message,
      type: saved.type,
      category: saved.category,
      createdAt: saved.createdAt,
    });
    return saved;
  }

  notifyAdmins(payload) {
    this.io?.to('admins').emit('admin:notification', payload);
  }

  emitBalanceUpdate(userId, newBalance) {
    this.io?.to(`user:${userId}`).emit('balance:updated', { newBalance, timestamp: new Date() });
  }

  emitWithdrawalUpdate(userId, withdrawal) {
    this.io?.to(`user:${userId}`).emit('withdrawal:updated', {
      withdrawalId: withdrawal._id,
      status: withdrawal.status,
      amount: withdrawal.amount,
      timestamp: new Date(),
    });
  }
}

module.exports = NotificationEmitter;
