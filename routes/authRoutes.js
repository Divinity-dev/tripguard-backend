import express from "express";

import {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

router.post("/forgot-password", forgotPassword);

router.post("/verify-reset-otp", verifyResetOtp);

router.post("/reset-password", resetPassword);

export default router