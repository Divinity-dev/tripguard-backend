import express from "express";

import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  setupPaymentAccount,
  getPaymentAccount,
  updatePaymentAccount,
  getNigerianBanks,
} from "../controllers/userController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All user routes require authentication
router.use(protect);

// Profile
router.get(
  "/profile",
  getProfile
);

router.put(
  "/profile",
  updateProfile
);

// Password
router.put(
  "/change-password",
  changePassword
);

// Nigerian banks
router.get(
  "/banks",
  getNigerianBanks
);

// Owner payment account
router.post(
  "/payment-account",
  setupPaymentAccount
);

router.get(
  "/payment-account",
  getPaymentAccount
);

router.put(
  "/payment-account",
  updatePaymentAccount
);

// Account
router.delete(
  "/account",
  deleteAccount
);

export default router;