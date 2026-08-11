import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Guest is required"],
    },

    accommodation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Accommodation",
      required: [true, "Accommodation is required"],
    },

    checkInDate: {
      type: Date,
      required: [true, "Check-in date is required"],
    },

    checkOutDate: {
      type: Date,
      required: [true, "Check-out date is required"],
    },

    guests: {
      type: Number,
      required: [true, "Number of guests is required"],
      min: [1, "There must be at least one guest"],
    },

    totalNights: {
      type: Number,
      required: [true, "Total nights is required"],
      min: [1, "Total nights must be at least 1"],
    },

    pricePerNight: {
      type: Number,
      required: [true, "Price per night is required"],
      min: [0, "Price cannot be negative"],
    },

    totalAmount: {
      type: Number,
      required: [true, "Total booking amount is required"],
      min: [0, "Total amount cannot be negative"],
    },

    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "partially_refunded"],
      default: "pending",
    },

    bookingStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "checked-in",
        "checked-out",
        "cancelled",
        "completed",
      ],
      default: "pending",
    },

    paymentReference: {
      type: String,
      default: "",
      trim: true,
    },

    paymentDate: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    specialRequests: {
      type: String,
      default: "",
      trim: true,
    },

    safetyContact: {
      name: {
        type: String,
        trim: true,
      },

      email: {
        type: String,
        lowercase: true,
        trim: true,
      },

      phone: {
        type: String,
        trim: true,
      },
    },

    safetyNotifications: {
      enabled: {
        type: Boolean,
        default: false,
      },

      checkInNotificationSent: {
        type: Boolean,
        default: false,
      },

      checkOutNotificationSent: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;

