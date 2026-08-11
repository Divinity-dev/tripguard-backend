import Booking from "../models/Booking.js";
import Accommodation from "../models/Accommodation.js";

export const createBooking = async (req, res) => {
  try {
    const {
      accommodation,
      checkInDate,
      checkOutDate,
      guests,
      specialRequests,
      safetyContact,
    } = req.body;

    if (!accommodation || !checkInDate || !checkOutDate || !guests) {
      return res.status(400).json({
        success: false,
        message:
          "Accommodation, check-in date, check-out date and number of guests are required",
      });
    }

    const property = await Accommodation.findOne({
      _id: accommodation,
      status: "approved",
      isAvailable: true,
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Accommodation is not available",
      });
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (
      Number.isNaN(checkIn.getTime()) ||
      Number.isNaN(checkOut.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking dates",
      });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({
        success: false,
        message: "Check-out date must be after check-in date",
      });
    }

    if (guests < 1 || guests > property.maxGuests) {
      return res.status(400).json({
        success: false,
        message: `This accommodation allows a maximum of ${property.maxGuests} guests`,
      });
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    const totalNights = Math.ceil(
      (checkOut - checkIn) / millisecondsPerDay
    );

    const totalAmount = totalNights * property.pricePerNight;

    // Prevent double booking.
    const conflictingBooking = await Booking.findOne({
      accommodation,
      bookingStatus: {
        $in: ["pending", "confirmed", "checked-in"],
      },
      checkInDate: {
        $lt: checkOut,
      },
      checkOutDate: {
        $gt: checkIn,
      },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        message: "This accommodation is already booked for those dates",
      });
    }

    const bookingReference = `TG-${Date.now()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const booking = await Booking.create({
      guest: req.user.id,
      accommodation,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      guests,
      totalNights,
      pricePerNight: property.pricePerNight,
      totalAmount,
      bookingReference,
      specialRequests: specialRequests?.trim() || "",
      safetyContact: safetyContact || {},
    });

    const populatedBooking = await Booking.findById(booking._id).populate(
      "accommodation",
      "name images pricePerNight location checkInTime checkOutTime"
    );

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: populatedBooking,
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create booking",
    });
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      guest: req.user.id,
    })
      .populate(
        "accommodation",
        "name images location pricePerNight checkInTime checkOutTime"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Get my bookings error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve bookings",
    });
  }
};

export const getBooking = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      guest: req.user.id,
    })
      .populate(
        "accommodation",
        "name description type images pricePerNight location amenities checkInTime checkOutTime"
      )
      .populate("guest", "firstName lastName email phone");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("Get booking error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve booking",
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { cancellationReason } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      guest: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (
      ["cancelled", "checked-out", "completed"].includes(
        booking.bookingStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "This booking can no longer be cancelled",
      });
    }

    booking.bookingStatus = "cancelled";
    booking.cancellationReason = cancellationReason?.trim() || "";
    booking.cancelledAt = new Date();

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to cancel booking",
    });
  }
};

export const getOwnerBookings = async (req, res) => {
  try {
    const accommodations = await Accommodation.find({
      owner: req.user.id,
    }).select("_id");

    const accommodationIds = accommodations.map(
      (accommodation) => accommodation._id
    );

    const bookings = await Booking.find({
      accommodation: {
        $in: accommodationIds,
      },
    })
      .populate("guest", "firstName lastName email phone")
      .populate(
        "accommodation",
        "name images location pricePerNight"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Get owner bookings error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve owner bookings",
    });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "confirmed",
      "checked-in",
      "checked-out",
      "completed",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking status",
      });
    }

    const accommodation = await Accommodation.findOne({
      _id: req.body.accommodationId,
      owner: req.user.id,
    });

    if (!accommodation) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to manage this booking",
      });
    }

    const booking = await Booking.findOneAndUpdate(
      {
        _id: req.params.id,
        accommodation: accommodation._id,
      },
      {
        bookingStatus: status,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Update booking status error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update booking status",
    });
  }
}