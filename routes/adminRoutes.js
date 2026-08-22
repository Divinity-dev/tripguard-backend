import express from "express";

import {
  getDashboardStats,
  getUsers,
  getUser,
  updateUserStatus,
  getAllAccommodations,
  deleteAccommodation,
  getAllBookings,
  updateBookingStatus,
  getAllPayments,
  getContactMessages,
  updateContactMessage,
  deleteContactMessage,
  getAdminNotifications,
  markAdminNotificationAsRead,
  markAllAdminNotificationsAsRead,
  deleteAdminNotification,
  getAdminReports,
} from "../controllers/adminController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ===============================
// ADMIN PROTECTION
// ===============================

router.use(
  protect,
  authorizeRoles("admin")
);

// ===============================
// DASHBOARD
// ===============================

router.get(
  "/dashboard",
  getDashboardStats
);

router.get(
  "/reports",
  getAdminReports
);

// ===============================
// USERS
// ===============================

router.get(
  "/users",
  getUsers
);

router.get(
  "/users/:id",
  getUser
);

router.patch(
  "/users/:id",
  updateUserStatus
);

// ===============================
// ACCOMMODATIONS
// ===============================

router.get(
  "/accommodations",
  getAllAccommodations
);

router.delete(
  "/accommodations/:id",
  deleteAccommodation
);

// Pending accommodations
// router.get(
//   "/accommodations/pending",
//   getPendingAccommodations
// );

// Update accommodation status
// router.patch(
//   "/accommodations/:id",
//   updateAccommodationStatus
// );

// ===============================
// BOOKINGS
// ===============================

router.get(
  "/bookings",
  getAllBookings
);

router.patch(
  "/bookings/:id/status",
  updateBookingStatus
);

// ===============================
// PAYMENTS
// ===============================

router.get(
  "/payments",
  getAllPayments
);

// ===============================
// CONTACT MESSAGES
// ===============================

router.get(
  "/contact-messages",
  getContactMessages
);

router.patch(
  "/contact-messages/:id",
  updateContactMessage
);

router.delete(
  "/contact-messages/:id",
  deleteContactMessage
);

// ===============================
// NOTIFICATIONS
// ===============================

router.get(
  "/notifications",
  getAdminNotifications
);

router.patch(
  "/notifications/read-all",
  markAllAdminNotificationsAsRead
);

router.patch(
  "/notifications/:id/read",
  markAdminNotificationAsRead
);

router.delete(
  "/notifications/:id",
  deleteAdminNotification
);

export default router;