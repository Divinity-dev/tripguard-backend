import express from "express";

import {
  createAccommodation,
  getAccommodations,
  getAccommodation,
  updateAccommodation,
  deleteAccommodation,
  getOwnerAccommodations,
} from "../controllers/accommodationsController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public traveller routes
router.get("/", getAccommodations);

// Owner create accommodation
router.post(
  "/",
  protect,
  authorizeRoles("owner"),
  createAccommodation
);

router.get(
  "/owner/my-accommodations",
  protect,
  authorizeRoles("owner"),
  getOwnerAccommodations
);

router.put(
  "/:id",
  protect,
  authorizeRoles("owner"),
  updateAccommodation
);

router.delete(
  "/:id",
  protect,
  authorizeRoles("owner"),
  deleteAccommodation
);

// Dynamic route should come after specific routes
router.get("/:id", getAccommodation);

export default router;