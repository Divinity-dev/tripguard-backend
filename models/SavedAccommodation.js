import mongoose from "mongoose";

const savedAccommodationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    accommodation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

savedAccommodationSchema.index(
  {
    user: 1,
    accommodation: 1,
  },
  {
    unique: true,
  }
);

const SavedAccommodation = mongoose.model(
  "SavedAccommodation",
  savedAccommodationSchema
);

export default SavedAccommodation;