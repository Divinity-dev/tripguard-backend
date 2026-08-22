import express from "express";

import {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  getBooking,
  cancelBooking,
  updateBookingStatus,
  checkInBooking,
  checkOutBooking,
} from "../controllers/bookingController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All booking routes require authentication
router.use(protect);

// Traveller routes
router.post("/", authorizeRoles("user"), createBooking);

router.get(
  "/owner/my-bookings",
  authorizeRoles("owner"),
  getOwnerBookings
);

router.get(
  "/my-bookings",
  authorizeRoles("user"),
  getMyBookings
);

router.get("/:id", getBooking);

router.put(
  "/:id/cancel",
  authorizeRoles("user", "owner"),
  cancelBooking
);

// Traveller protection routes

router.put(
  "/:id/check-in",
  authorizeRoles("user"),
  checkInBooking
);

router.put(
  "/:id/check-out",
  authorizeRoles("user"),
  checkOutBooking
);

// Owner route
router.put(
  "/:id/status",
  authorizeRoles("owner"),
  updateBookingStatus
);

export default router