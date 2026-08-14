import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import connectDB from "./config/db.js";

// Routes
import accommodationsRoutes from "./routes/accommodationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import notificationsRoutes from "./routes/notificationRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

/*
 * ==================================================
 * CORS
 * ==================================================
 */

app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:3000",
    credentials: true,
  })
);

/*
 * ==================================================
 * BODY PARSING
 * ==================================================
 */

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(cookieParser());

/*
 * ==================================================
 * API ROUTES
 * ==================================================
 */

app.use(
  "/api/accommodations",
  accommodationsRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/bookings",
  bookingRoutes
);

app.use(
  "/api/contact",
  contactRoutes
);

app.use(
  "/api/notifications",
  notificationsRoutes
);

app.use(
  "/api/payments",
  paymentRoutes
);

app.use(
  "/api/reviews",
  reviewRoutes
);

app.use(
  "/api/users",
  userRoutes
);

/*
 * ==================================================
 * ROOT / HEALTH CHECK
 * ==================================================
 */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "TripGuard API is running",
  });
});

/*
 * ==================================================
 * DATABASE
 * ==================================================
 */

connectDB();

/*
 * ==================================================
 * START SERVER
 * ==================================================
 */

app.listen(PORT, () => {
  console.log(
    `TripGuard API running on port ${PORT}`
  );
});
