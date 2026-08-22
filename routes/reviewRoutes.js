import express from "express";

import {
  createReview,
  getAccommodationReviews,
  getReview,
  getMyReviews,
  getOwnerReviews,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public
router.get(
  "/accommodation/:accommodationId",
  getAccommodationReviews
);

// Protected
router.use(protect);

// Traveller
router.post(
  "/",
  authorizeRoles("user"),
  createReview
);

router.get(
  "/my-reviews",
  authorizeRoles("user"),
  getMyReviews
);

// Owner
router.get(
  "/owner",
  authorizeRoles("owner"),
  getOwnerReviews
);

// Individual review
router.get("/:id", getReview);

router.patch("/:id", updateReview);

router.delete("/:id", deleteReview);

export default router;