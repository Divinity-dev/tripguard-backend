import express from "express";
import {
  initializePayment,
  verifyPayment,
  getPayment,
  getMyPayments,
  getPaymentByReference,
  handlePaystackWebhook,
} from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Paystack webhook
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handlePaystackWebhook
);

// Protected payment routes
router.use(protect);

router.post("/initialize", initializePayment);

router.get("/my-payments", getMyPayments);

router.get("/reference/:reference", getPaymentByReference);

router.get("/:id", getPayment);

router.get("/verify/:reference", verifyPayment);

export default router;