import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getOwnerDashboard } from "../controllers/ownerController.js";

const router = express.Router();

router.get("/dashboard", protect, getOwnerDashboard);

export default router;