import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking is required"],
    },

    // Traveller who made the payment
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },

    // Property owner who receives the owner's share
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Property owner is required"],
    },

    // Property that generated the booking/payment
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Accommodation",
      required: [true, "Property is required"],
    },

    // Total amount paid by the traveller
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Payment amount cannot be negative"],
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    /*
     * TripGuard commission
     *
     * We currently take 10% from every
     * successful booking.
     */
    commissionRate: {
      type: Number,
      default: 10,
      min: [0, "Commission rate cannot be negative"],
      max: [100, "Commission rate cannot exceed 100"],
    },

    // TripGuard's share
    commissionAmount: {
      type: Number,
      default: 0,
      min: [0, "Commission amount cannot be negative"],
    },

    // Property owner's share
    ownerAmount: {
      type: Number,
      default: 0,
      min: [0, "Owner amount cannot be negative"],
    },

    /*
     * Paystack subaccount belonging to the property owner.
     *
     * Example:
     * ACCT_xxxxxxxxxxxxxx
     */
    paystackSubaccount: {
      type: String,
      default: "",
      trim: true,
    },

    reference: {
      type: String,
      required: [true, "Payment reference is required"],
      unique: true,
      trim: true,
    },

    // Paystack's transaction reference
    paystackReference: {
      type: String,
      default: "",
      unique: true,
      sparse: true,
      trim: true,
    },

    // Paystack's internal transaction ID
    paystackTransactionId: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "successful",
        "failed",
        "abandoned",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
    },

    channel: {
      type: String,
      default: "",
      trim: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    refundAmount: {
      type: Number,
      default: 0,
      min: [0, "Refund amount cannot be negative"],
    },

    refundStatus: {
      type: String,
      enum: [
        "none",
        "pending",
        "successful",
        "failed",
      ],
      default: "none",
    },

    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;