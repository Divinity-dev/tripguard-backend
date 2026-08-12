import express from "express";
import {
  createReview,
  getAccommodationReviews,
  getReview,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.get("/accommodation/:accommodationId", getAccommodationReviews);

// Protected
router.use(protect);

router.post("/", createReview);

router.get("/:id", getReview);

router.patch("/:id", updateReview);

router.delete("/:id", deleteReview);

export default router;