import mongoose from "mongoose";

const accommodationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Accommodation owner is required"],
    },

    name: {
      type: String,
      required: [true, "Accommodation name is required"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Accommodation description is required"],
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "hotel",
        "apartment",
        "short-let",
        "guest-house",
        "resort",
        "hostel",
        "villa",
        "other",
      ],
      required: [true, "Accommodation type is required"],
    },

    images: [
      {
        type: String,
        required: true,
      },
    ],

    pricePerNight: {
      type: Number,
      required: [true, "Price per night is required"],
      min: [0, "Price cannot be negative"],
    },

    location: {
      state: {
        type: String,
        required: [true, "State is required"],
        trim: true,
      },

      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },

      lga: {
        type: String,
        required: [true, "LGA is required"],
        trim: true,
      },

      address: {
        type: String,
        required: [true, "Address is required"],
        trim: true,
      },

      coordinates: {
        latitude: {
          type: Number,
        },

        longitude: {
          type: Number,
        },
      },
    },

    amenities: [
      {
        type: String,
        trim: true,
      },
    ],

    bedrooms: {
      type: Number,
      min: [0, "Bedrooms cannot be negative"],
    },

    bathrooms: {
      type: Number,
      min: [0, "Bathrooms cannot be negative"],
    },

    maxGuests: {
      type: Number,
      min: [1, "Maximum guests must be at least 1"],
    },

    checkInTime: {
      type: String,
      default: "14:00",
    },

    checkOutTime: {
      type: String,
      default: "12:00",
    },

    propertyWebsite: {
      type: String,
      trim: true,
      default: "",
    },

    

    isAvailable: {
      type: Boolean,
      default: true,
    },

    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    slug: {
  type: String,
  required: true,
  unique: true,
  lowercase: true,
  trim: true,
  index: true,
},
  },
  {
    timestamps: true,
  }
);


// ===============================
// INDEXES
// ===============================

accommodationSchema.index({
  status: 1,
  isAvailable: 1,
});

accommodationSchema.index({
  "location.state": 1,
  "location.city": 1,
  "location.lga": 1,
});

accommodationSchema.index({
  type: 1,
});

accommodationSchema.index({
  pricePerNight: 1,
});

accommodationSchema.index({
  averageRating: -1,
});

accommodationSchema.index({
  createdAt: -1,
});


const Accommodation = mongoose.model(
  "Accommodation",
  accommodationSchema
);

export default Accommodation;