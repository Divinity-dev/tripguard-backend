import mongoose from "mongoose";

const contactMessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },

    subject: {
      type: String,
      enum: [
        "general",
        "booking",
        "payment",
        "account",
        "safety",
        "other",
      ],
      required: [true, "Subject is required"],
    },

    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },

    status: {
      type: String,
      enum: ["unread", "read", "in-progress", "resolved", "closed"],
      default: "unread",
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    response: {
      type: String,
      default: "",
      trim: true,
    },

    respondedAt: {
      type: Date,
      default: null,
    },

    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const ContactMessage = mongoose.model(
  "ContactMessage",
  contactMessageSchema
);

export default ContactMessage