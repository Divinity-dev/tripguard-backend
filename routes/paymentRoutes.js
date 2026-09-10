import express from "express";

import {
  initializePayment,
  verifyPayment,
  getPayment,
  getMyPayments,
  getPaymentByReference,
  setupOwnerPayment,
} from "../controllers/paymentController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();



/*
 * ==================================================
 * AUTHENTICATED PAYMENT ROUTES
 * ==================================================
 */

router.use(protect);

/*
 * ==================================================
 * INITIALIZE PAYMENT
 * ==================================================
 *
 * POST /api/payments/initialize
 */

router.post(
  "/initialize",
  initializePayment
);

/*
 * ==================================================
 * VERIFY PAYMENT
 * ==================================================
 *
 * GET /api/payments/verify/:reference
 */

router.get(
  "/verify/:reference",
  verifyPayment
);

/*
 * ==================================================
 * GET MY PAYMENTS
 * ==================================================
 *
 * GET /api/payments/my-payments
 */

router.get(
  "/my-payments",
  getMyPayments
);

/*
 * ==================================================
 * GET PAYMENT BY REFERENCE
 * ==================================================
 *
 * GET /api/payments/reference/:reference
 */

router.get(
  "/reference/:reference",
  getPaymentByReference
);

/*
 * ==================================================
 * OWNER PAYMENT SETUP
 * ==================================================
 *
 * POST /api/payments/owner/setup
 */

router.post(
  "/owner/setup",
  setupOwnerPayment
);

/*
 * ==================================================
 * GET SINGLE PAYMENT
 * ==================================================
 *
 * GET /api/payments/:id
 */

router.get(
  "/:id",
  getPayment
);

export default router;