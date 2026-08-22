import express from "express";

import {
  getNotifications,
  getNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notificationController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// Get all notifications
router.get("/", getNotifications);

// Mark all notifications as read
router.patch("/read-all", markAllNotificationsAsRead);

// Delete all notifications
router.delete("/clear-all", deleteAllNotifications);

// Get a single notification
router.get("/:id", getNotification);

// Mark a notification as read
router.patch("/:id/read", markNotificationAsRead);

// Delete a notification
router.delete("/:id", deleteNotification);

export default router;