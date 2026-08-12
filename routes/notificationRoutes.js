import express from "express";
import {
  getNotifications,
  getNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getNotifications);

router.get("/:id", getNotification);

router.patch("/:id/read", markNotificationAsRead);

router.patch("/read-all", markAllNotificationsAsRead);

router.delete("/:id", deleteNotification);

export default router;