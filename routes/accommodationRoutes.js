import express from "express";

import {
  createAccommodation,
  getAccommodations,
  getAccommodation,
  getOwnerAccommodations,
  getOwnerAccommodation,
  updateAccommodation,
  deleteAccommodation,
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

// Owner's accommodations
router.get(
  "/owner/my-accommodations",
  protect,
  authorizeRoles("owner"),
  getOwnerAccommodations
);

// Get one accommodation belonging to the logged-in owner
router.get(
  "/owner/:id",
  protect,
  authorizeRoles("owner"),
  getOwnerAccommodation
);

// Get accommodation by slug
router.get("/:slug", getAccommodation);

// Owner update accommodation
router.put(
  "/:id",
  protect,
  authorizeRoles("owner"),
  updateAccommodation
);

// Owner delete accommodation
router.delete(
  "/:id",
  protect,
  authorizeRoles("owner"),
  deleteAccommodation
);


export default router;