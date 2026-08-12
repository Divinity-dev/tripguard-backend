import express from "express";

import {
  createBooking,
  getMyBookings,
  getBooking,
  cancelBooking,
  updateBookingStatus,
} from "../controllers/bookingController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All booking routes require authentication
router.use(protect);

// Traveller routes
router.post("/", authorizeRoles("user"), createBooking);

router.get(
  "/my-bookings",
  authorizeRoles("user"),
  getMyBookings
);

router.get("/:id", getBooking);

router.put(
  "/:id/cancel",
  authorizeRoles("user"),
  cancelBooking
);

// Owner route
router.put(
  "/:id/status",
  authorizeRoles("owner"),
  updateBookingStatus
);

export default router