import Accommodation from "../models/accommodations.js";

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const generateUniqueSlug = async (name, accommodationId = null) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const existingAccommodation = await Accommodation.findOne({
      slug,
      ...(accommodationId
        ? { _id: { $ne: accommodationId } }
        : {}),
    });

    if (!existingAccommodation) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

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

   const slug = await generateUniqueSlug(name);

const accommodation = await Accommodation.create({
  owner: req.user.id,
  name: name.trim(),
  slug,
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
      message: "Accommodation created successfully",
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
  search,
  state,
  city,
  lga,
  type,
  minPrice,
  maxPrice,
  guests,
  bedrooms,
  page = 1,
  limit = 12,
  sort = "recommended",
} = req.query;

    const filter = {
      status: "approved",
      isAvailable: true,
    };

    if (search?.trim()) {
  const searchRegex = {
    $regex: search.trim(),
    $options: "i",
  };

  filter.$or = [
    { name: searchRegex },
    { "location.state": searchRegex },
    { "location.city": searchRegex },
    { "location.lga": searchRegex },
    { type: searchRegex },
  ];
}

    // LOCATION
    if (state) {
      filter["location.state"] = {
        $regex: state.trim(),
        $options: "i",
      };
    }

    if (city) {
      filter["location.city"] = {
        $regex: city.trim(),
        $options: "i",
      };
    }

    if (lga) {
      filter["location.lga"] = {
        $regex: lga.trim(),
        $options: "i",
      };
    }

    // ACCOMMODATION TYPE
    if (type) {
      filter.type = type;
    }

    // PRICE
    if (minPrice || maxPrice) {
      filter.pricePerNight = {};

      if (minPrice) {
        filter.pricePerNight.$gte = Number(minPrice);
      }

      if (maxPrice) {
        filter.pricePerNight.$lte = Number(maxPrice);
      }
    }

    // GUESTS
    if (guests) {
      filter.maxGuests = {
        $gte: Number(guests),
      };
    }

    // BEDROOMS
    if (bedrooms) {
      filter.bedrooms = {
        $gte: Number(bedrooms),
      };
    }

    // PAGINATION
    const currentPage = Math.max(Number(page) || 1, 1);
    const itemsPerPage = Math.min(
      Math.max(Number(limit) || 12, 1),
      50
    );

    const skip = (currentPage - 1) * itemsPerPage;

    // SORTING
    let sortOption = { createdAt: -1 };

    if (sort === "price-low") {
      sortOption = { pricePerNight: 1 };
    }

    if (sort === "price-high") {
      sortOption = { pricePerNight: -1 };
    }

    if (sort === "rating") {
      sortOption = { averageRating: -1 };
    }

    // TOTAL COUNT
    const total = await Accommodation.countDocuments(filter);

    // ACCOMMODATIONS
    const accommodations = await Accommodation.find(filter)
      .populate("owner", "firstName lastName profileImage")
      .sort(sortOption)
      .skip(skip)
      .limit(itemsPerPage);

    const totalPages = Math.ceil(total / itemsPerPage);

    res.status(200).json({
      success: true,
      count: accommodations.length,
      accommodations,
      pagination: {
        page: currentPage,
        limit: itemsPerPage,
        total,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
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
    const { slug } = req.params;

    const accommodation = await Accommodation.findOne({
      slug: slug.toLowerCase(),
       isAvailable: true,
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

    const oldName = accommodation.name;

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

    // Generate a new unique slug only when the name changes
    if (
      req.body.name !== undefined &&
      req.body.name.trim() !== oldName
    ) {
      accommodation.slug = await generateUniqueSlug(
        req.body.name,
        accommodation._id
      );
    }
    await accommodation.save();

    res.status(200).json({
      success: true,
      message: "Accommodation updated successfully",
      accommodation,
    });
  } catch (error) {
    console.error("Update accommodation error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An accommodation with this name already exists",
      });
    }

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

export const getOwnerAccommodation = async (req, res) => {
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

    res.status(200).json({
      success: true,
      accommodation,
    });
  } catch (error) {
    console.error("Get owner accommodation error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve your accommodation",
    });
  }
};