import Accommodation from "../models/Accommodation.js";

export const createAccommodation = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      images,
      pricePerNight,
      location,
      amenities,
      bedrooms,
      bathrooms,
      maxGuests,
      checkInTime,
      checkOutTime,
      propertyWebsite,
    } = req.body;

    if (
      !name ||
      !description ||
      !type ||
      !images ||
      !images.length ||
      !pricePerNight ||
      !location?.state ||
      !location?.city ||
      !location?.lga ||
      !location?.address
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required accommodation details",
      });
    }

    const accommodation = await Accommodation.create({
      owner: req.user.id,
      name: name.trim(),
      description: description.trim(),
      type,
      images,
      pricePerNight,
      location,
      amenities: amenities || [],
      bedrooms,
      bathrooms,
      maxGuests,
      checkInTime,
      checkOutTime,
      propertyWebsite: propertyWebsite?.trim() || "",
    });

    res.status(201).json({
      success: true,
      message: "Accommodation submitted successfully",
      accommodation,
    });
  } catch (error) {
    console.error("Create accommodation error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create accommodation",
    });
  }
};

export const getAccommodations = async (req, res) => {
  try {
    const {
      state,
      city,
      lga,
      type,
      minPrice,
      maxPrice,
      guests,
      bedrooms,
      status,
    } = req.query;

    const filter = {
      status: status || "approved",
      isAvailable: true,
    };

    if (state) {
      filter["location.state"] = {
        $regex: state,
        $options: "i",
      };
    }

    if (city) {
      filter["location.city"] = {
        $regex: city,
        $options: "i",
      };
    }

    if (lga) {
      filter["location.lga"] = {
        $regex: lga,
        $options: "i",
      };
    }

    if (type) {
      filter.type = type;
    }

    if (minPrice || maxPrice) {
      filter.pricePerNight = {};

      if (minPrice) {
        filter.pricePerNight.$gte = Number(minPrice);
      }

      if (maxPrice) {
        filter.pricePerNight.$lte = Number(maxPrice);
      }
    }

    if (guests) {
      filter.maxGuests = {
        $gte: Number(guests),
      };
    }

    if (bedrooms) {
      filter.bedrooms = {
        $gte: Number(bedrooms),
      };
    }

    const accommodations = await Accommodation.find(filter)
      .populate("owner", "firstName lastName profileImage")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: accommodations.length,
      accommodations,
    });
  } catch (error) {
    console.error("Get accommodations error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve accommodations",
    });
  }
};

export const getAccommodation = async (req, res) => {
  try {
    const accommodation = await Accommodation.findOne({
      _id: req.params.id,
      status: "approved",
    }).populate(
      "owner",
      "firstName lastName profileImage email phone"
    );

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found",
      });
    }

    res.status(200).json({
      success: true,
      accommodation,
    });
  } catch (error) {
    console.error("Get accommodation error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve accommodation",
    });
  }
};

export const getOwnerAccommodations = async (req, res) => {
  try {
    const accommodations = await Accommodation.find({
      owner: req.user.id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: accommodations.length,
      accommodations,
    });
  } catch (error) {
    console.error("Get owner accommodations error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve your accommodations",
    });
  }
};

export const updateAccommodation = async (req, res) => {
  try {
    const accommodation = await Accommodation.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found or you are not the owner",
      });
    }

    const allowedFields = [
      "name",
      "description",
      "type",
      "images",
      "pricePerNight",
      "location",
      "amenities",
      "bedrooms",
      "bathrooms",
      "maxGuests",
      "checkInTime",
      "checkOutTime",
      "propertyWebsite",
      "isAvailable",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        accommodation[field] = req.body[field];
      }
    });

    // Any substantive owner update should go back through admin review.
    accommodation.status = "pending";

    await accommodation.save();

    res.status(200).json({
      success: true,
      message: "Accommodation updated and submitted for review",
      accommodation,
    });
  } catch (error) {
    console.error("Update accommodation error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update accommodation",
    });
  }
};

export const deleteAccommodation = async (req, res) => {
  try {
    const accommodation = await Accommodation.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found or you are not the owner",
      });
    }

    await accommodation.deleteOne();

    res.status(200).json({
      success: true,
      message: "Accommodation deleted successfully",
    });
  } catch (error) {
    console.error("Delete accommodation error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete accommodation",
    });
  }
};

export const updateAccommodationAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be a boolean",
      });
    }

    const accommodation = await Accommodation.findOneAndUpdate(
      {
        _id: req.params.id,
        owner: req.user.id,
      },
      {
        isAvailable,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found or you are not the owner",
      });
    }

    res.status(200).json({
      success: true,
      message: isAvailable
        ? "Accommodation is now available"
        : "Accommodation is now unavailable",
      accommodation,
    });
  } catch (error) {
    console.error("Update accommodation availability error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update accommodation availability",
    });
  }
}