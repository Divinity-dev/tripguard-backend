import "dotenv/config";

import express from "express";
import cors from "cors";
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
import cookieParser from "cookie-parser";
import ownerRoutes from "./routes/ownerRoutes.js";


const app = express();

const PORT = process.env.PORT || 5000;

/*
 * ==================================================
 * CORS
 * ==================================================
 */

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.62.209:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without an origin
    // such as Postman or server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error("Not allowed by CORS")
    );
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],

  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));


/*
 * PAYSTACK WEBHOOK
 *
 * Must receive the raw request body before
 * express.json() parses it.
 */
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handlePaystackWebhook
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

app.use("/api/owner", ownerRoutes);

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

app.use("/api/saved", savedRoutes);

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
