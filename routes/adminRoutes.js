import express from "express";
import {
  getDashboardStats,
  getUsers,
  getUser,
  updateUserStatus,
  getAllAccommodations,
  getPendingAccommodations,
  updateAccommodationStatus,
  getAllBookings,
  updateBookingStatus,
  getAllPayments,
  getContactMessages,
  updateContactMessage,
  deleteContactMessage,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/dashboard", getDashboardStats);

router.get("/users", getUsers);
router.get("/users/:id", getUser);
router.patch("/users/:id", updateUserStatus);

router.get("/accommodations", getAllAccommodations);
router.get("/accommodations/pending", getPendingAccommodations);
router.patch("/accommodations/:id", updateAccommodationStatus);

router.get("/bookings", getAllBookings);
router.patch("/bookings/:id/status", updateBookingStatus);

router.get("/payments", getAllPayments);

router.get("/contact-messages", getContactMessages);
router.patch("/contact-messages/:id", updateContactMessage);
router.delete("/contact-messages/:id", deleteContactMessage);

export default router;