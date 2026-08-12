import express from "express";

import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from "../controllers/userController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All user routes require authentication
router.use(protect);

// Profile
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Password
router.put("/change-password", changePassword);

// Account
router.delete("/account", deleteAccount);

export default router