import express from "express";

import {
  saveAccommodation,
  removeSavedAccommodation,
  getMySavedAccommodations,
  checkSavedAccommodation,
  getSavedAccommodationCount,
} from "../controllers/savedController.js";

import {protect} from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/:accommodationId",
  protect,
  saveAccommodation
);

router.delete(
  "/:accommodationId",
  protect,
  removeSavedAccommodation
);

router.get(
  "/",
  protect,
  getMySavedAccommodations
);

router.get(
  "/count",
  protect,
  getSavedAccommodationCount
);

router.get(
  "/:accommodationId/check",
  protect,
  checkSavedAccommodation
);

export default router;