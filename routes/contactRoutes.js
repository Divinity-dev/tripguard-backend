import express from "express";
import { createContactMessage } from "../controllers/contactController.js";
import {
  getContactMessages,
  getContactMessage,
  updateContactMessage,
  deleteContactMessage,
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public
router.post("/", createContactMessage);

// Admin
router.get(
  "/",
  protect,
  authorizeRoles("admin"),
  getContactMessages
);

router.get(
  "/:id",
  protect,
  authorizeRoles("admin"),
  getContactMessage
);

router.patch(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateContactMessage
);

router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deleteContactMessage
);

export default router;