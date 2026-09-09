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
  checkBookingAvailability,
} from "../controllers/bookingController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Availability is public.
// Users should be able to check dates before completing authentication/booking.
router.get("/availability", checkBookingAvailability);

// All other booking routes require authentication
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

export default router;