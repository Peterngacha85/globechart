const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { user: req.user._id };
  if (req.query.isRead === 'true' || req.query.isRead === 'false') filter.isRead = req.query.isRead === 'true';

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  sendSuccess(res, {
    unreadCount,
    total,
    page,
    limit,
    notifications: notifications.map((n) => ({
      notificationId: n._id,
      title: n.title,
      message: n.message,
      type: n.type,
      category: n.category,
      isRead: n.isRead,
      actionUrl: n.actionUrl,
      actionLabel: n.actionLabel,
      createdAt: n.createdAt,
    })),
  });
});

exports.markRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Notification not found');
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true, readAt: new Date() }
  );
  if (!updated) throw new ApiError(404, 'Notification not found');
  sendSuccess(res, null, 'Notification marked as read');
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true, readAt: new Date() });
  sendSuccess(res, null, 'All notifications marked as read');
});
