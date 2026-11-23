import Review from "../models/review.js";
import Booking from "../models/bookings.js";
import Accommodation from "../models/accommodations.js";

export const createReview = async (req, res) => {
  try {
    const {
      accommodation,
      rating,
      comment,
    } = req.body;

    if (!accommodation || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: "Accommodation, rating and comment are required",
      });
    }

    if (Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const booking = await Booking.findOne({
      guest: req.user.id,
      accommodation,
      bookingStatus: {
        $in: ["checked-out", "completed"],
      },
    });

    if (!booking) {
      return res.status(403).json({
        success: false,
        message:
          "You can only review an accommodation after completing a stay",
      });
    }

    const existingReview = await Review.findOne({
      user: req.user.id,
      accommodation,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this accommodation",
      });
    }

    const review = await Review.create({
      user: req.user.id,
      accommodation,
      booking: booking._id,
      rating: Number(rating),
      comment: comment.trim(),
    });

    await updateAccommodationRating(accommodation);

    const populatedReview = await Review.findById(review._id).populate(
      "user",
      "firstName lastName profileImage"
    );

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review: populatedReview,
    });
  } catch (error) {
    console.error("Create review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create review",
    });
  }
};

export const getReview = async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).populate("accommodation", "name images location");

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Get review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve review",
    });
  }
};

export const getAccommodationReviews = async (req, res) => {
  try {
    const reviews = await Review.find({
      accommodation: req.params.accommodationId,
    })
      .populate("user", "firstName lastName profileImage")
      .sort({ createdAt: -1 });

    const totalReviews = reviews.length;

    const totalRating = reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );

    const averageRating =
      totalReviews > 0 ? totalRating / totalReviews : 0;

    res.status(200).json({
      success: true,
      count: totalReviews,
      averageRating: Number(averageRating.toFixed(1)),
      reviews,
    });
  } catch (error) {
    console.error("Get accommodation reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve reviews",
    });
  }
};

export const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({
      user: req.user.id,
    })
      .populate(
        "accommodation",
        "name images location"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("Get my reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve your reviews",
    });
  }
};

export const getOwnerReviews = async (req, res) => {
  try {
    // Find all accommodations belonging to the logged-in owner
    const accommodations = await Accommodation.find({
      owner: req.user.id,
    }).select("_id name images location averageRating totalReviews");

    const accommodationIds = accommodations.map(
      (accommodation) => accommodation._id
    );

    // Find reviews belonging only to those accommodations
    const reviews = await Review.find({
      accommodation: {
        $in: accommodationIds,
      },
    })
      .populate(
        "user",
        "firstName lastName profileImage"
      )
      .populate(
        "accommodation",
        "name images location averageRating totalReviews"
      )
      .populate(
        "booking",
        "bookingReference checkInDate checkOutDate"
      )
      .sort({
        createdAt: -1,
      });

    // Rating distribution
    const ratingDistribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    let totalRating = 0;

    reviews.forEach((review) => {
      totalRating += review.rating;

      if (ratingDistribution[review.rating] !== undefined) {
        ratingDistribution[review.rating]++;
      }
    });

    const totalReviews = reviews.length;

    const averageRating =
      totalReviews > 0
        ? Number((totalRating / totalReviews).toFixed(1))
        : 0;

    res.status(200).json({
      success: true,

      stats: {
        totalReviews,
        averageRating,
        ratingDistribution,
        totalProperties: accommodations.length,
      },

      properties: accommodations,

      reviews,
    });
  } catch (error) {
    console.error("Get owner reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve owner reviews",
    });
  }
};

export const updateReview = async (req, res) => {
  try {
    const {
      rating,
      comment,
    } = req.body;

    const review = await Review.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (rating !== undefined) {
      if (Number(rating) < 1 || Number(rating) > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      review.rating = Number(rating);
    }

    if (comment !== undefined) {
      if (!comment.trim()) {
        return res.status(400).json({
          success: false,
          message: "Comment cannot be empty",
        });
      }

      review.comment = comment.trim();
    }

    await review.save();

    await updateAccommodationRating(review.accommodation);

    const updatedReview = await Review.findById(
      review._id
    ).populate(
      "user",
      "firstName lastName profileImage"
    );

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error("Update review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update review",
    });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const accommodationId = review.accommodation;

    await review.deleteOne();

    await updateAccommodationRating(accommodationId);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete review",
    });
  }
};

const updateAccommodationRating = async (accommodationId) => {
  const reviews = await Review.find({
    accommodation: accommodationId,
  });

  const totalReviews = reviews.length;

  const totalRating = reviews.reduce(
    (sum, review) => sum + review.rating,
    0
  );

  const averageRating =
    totalReviews > 0 ? totalRating / totalReviews : 0;

  await Accommodation.findByIdAndUpdate(
    accommodationId,
    {
      averageRating: Number(averageRating.toFixed(1)),
      totalReviews,
    }
  );
}