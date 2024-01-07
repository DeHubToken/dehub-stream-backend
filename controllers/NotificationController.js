const { paramNames } = require('../config/constants');
const notificationService = require('../services/NotificationService'); // Import your notification service
const { reqParam } = require('../utils/auth');

const NotificationController = {
  createNotification: async function (req, res, next) {
    try {
      const { userId, type, content } = req.body;
      await notificationService.createNotification(userId, type, content);
      res.status(201).json({ message: 'Notification created successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getUnreadNotifications: async function (req, res, next) {
    try {
      const address = reqParam(req, paramNames.address);
      const result = await notificationService.getNotifications(address);
      res.status(200).json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  markNotificationAsRead: async function (req, res, next) {
    try {
      const notificationId = req.params.notificationId;
      await notificationService.markNotificationAsRead(notificationId);
      res.status(200).json({ message: 'Notification marked as read' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = NotificationController;
