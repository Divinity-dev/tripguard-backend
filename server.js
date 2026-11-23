import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";

// Routes
import accommodationsRoutes from "./routes/accommodationRoutes.js";
import savedRoutes from "./routes/savedRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import notificationsRoutes from "./routes/notificationRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { handlePaystackWebhook } from "./controllers/paymentController.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.62.209:3000",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
]
  .flatMap((value) => value?.split(",") || [])
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    optionsSuccessStatus: 200,
  })
);

// Paystack sends a signed raw payload. Keep this before express.json().
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handlePaystackWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Connect on demand and reuse Mongoose's connection across warm invocations.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error("TripGuard database connection error:", error.message);

    return res.status(503).json({
      success: false,
      message: "The service is temporarily unavailable. Please try again.",
    });
  }
});

// API routes
app.use("/api/owner", ownerRoutes);
app.use("/api/accommodations", accommodationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/users", userRoutes);

// Root health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "TripGuard API is running",
    database: "connected",
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled TripGuard API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred",
  });
});

export default app;
