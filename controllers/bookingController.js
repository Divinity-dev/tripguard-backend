import Booking from "../models/bookings.js";
import Accommodation from "../models/accommodations.js";

const TRIPGUARD_FEE_RATE = 10;

/*
 * ==================================================
 * CREATE BOOKING
 * ==================================================
 */

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

    if (
      !accommodation ||
      !checkInDate ||
      !checkOutDate ||
      !guests
    ) {
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
        message:
          "Check-out date must be after check-in date",
      });
    }

    if (
      guests < 1 ||
      guests > property.maxGuests
    ) {
      return res.status(400).json({
        success: false,
        message: `This accommodation allows a maximum of ${property.maxGuests} guests`,
      });
    }

    const millisecondsPerDay =
      1000 * 60 * 60 * 24;

    const totalNights = Math.ceil(
      (checkOut - checkIn) /
        millisecondsPerDay
    );

    /*
     * --------------------------------------------------
     * PAYMENT CALCULATION
     * --------------------------------------------------
     *
     * Accommodation amount
     * + 10% TripGuard service fee
     * = Total amount traveller pays
     */

    const accommodationAmount =
      totalNights *
      property.pricePerNight;

    const serviceFee =
      Math.round(
        accommodationAmount *
          (TRIPGUARD_FEE_RATE / 100) *
          100
      ) / 100;

    const totalAmount =
      accommodationAmount +
      serviceFee;

    /*
     * --------------------------------------------------
     * PREVENT DOUBLE BOOKING
     * --------------------------------------------------
     */

    const conflictingBooking =
      await Booking.findOne({
        accommodation,
        bookingStatus: {
          $in: [
            "pending",
            "confirmed",
            "checked-in",
          ],
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
        message:
          "This accommodation is already booked for those dates",
      });
    }

    /*
     * Generate booking reference
     */

    const bookingReference =
      `TG-${Date.now()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

    /*
     * Create booking
     */

    const booking =
      await Booking.create({
        guest: req.user.id,

        accommodation,

        checkInDate: checkIn,

        checkOutDate: checkOut,

        guests,

        totalNights,

        pricePerNight:
          property.pricePerNight,

        accommodationAmount,

        serviceFee,

        totalAmount,

        bookingReference,

        specialRequests:
          specialRequests?.trim() || "",

        safetyContact:
          safetyContact || {},
      });

    const populatedBooking =
      await Booking.findById(
        booking._id
      ).populate(
        "accommodation",
        "name images pricePerNight location checkInTime checkOutTime owner"
      );

    return res.status(201).json({
      success: true,
      message:
        "Booking created successfully",
      booking: populatedBooking,
    });
  } catch (error) {
    console.error(
      "Create booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create booking",
    });
  }
};

/*
 * ==================================================
 * GET MY BOOKINGS
 * ==================================================
 */

export const getMyBookings = async (
  req,
  res
) => {
  try {
    const bookings =
      await Booking.find({
        guest: req.user.id,
      })
        .populate(
          "accommodation",
          "name images pricePerNight location checkInTime checkOutTime owner"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error(
      "Get my bookings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve bookings",
    });
  }
};

/*
 * ==================================================
 * GET SINGLE BOOKING
 * ==================================================
 */

export const getBooking = async (
  req,
  res
) => {
  try {
    const booking =
      await Booking.findById(
        req.params.id
      )
        .populate(
          "accommodation",
          "name images pricePerNight location checkInTime checkOutTime owner"
        )
        .populate(
          "guest",
          "firstName lastName email phone profileImage"
        );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const isGuest =
      booking.guest?._id?.toString() ===
      req.user.id.toString();

    const isOwner =
      booking.accommodation?.owner?.toString() ===
      req.user.id.toString();

    const isAdmin =
      req.user.role === "admin";

    if (
      !isGuest &&
      !isOwner &&
      !isAdmin
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to view this booking",
      });
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error(
      "Get booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve booking",
    });
  }
};

/*
 * ==================================================
 * CANCEL BOOKING
 * ==================================================
 */

export const cancelBooking = async (
  req,
  res
) => {
  try {
    const {
      cancellationReason,
    } = req.body;

    const booking =
      await Booking.findById(
        req.params.id
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    /*
     * Only the traveller who created
     * the booking can cancel it.
     */

    if (
      booking.guest.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to cancel this booking",
      });
    }

    if (
      booking.bookingStatus ===
      "cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking has already been cancelled",
      });
    }

    if (
      booking.bookingStatus ===
        "checked-in" ||
      booking.bookingStatus ===
        "checked-out" ||
      booking.bookingStatus ===
        "completed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking can no longer be cancelled",
      });
    }

    booking.bookingStatus =
      "cancelled";

    booking.cancellationReason =
      cancellationReason?.trim() || "";

    booking.cancelledAt =
      new Date();

    await booking.save();

    return res.status(200).json({
      success: true,
      message:
        "Booking cancelled successfully",
      booking,
    });
  } catch (error) {
    console.error(
      "Cancel booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to cancel booking",
    });
  }
};

/*
 * ==================================================
 * UPDATE BOOKING STATUS
 * ==================================================
 */

export const updateBookingStatus = async (
  req,
  res
) => {
  try {
    const {
      bookingStatus,
    } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "checked-in",
      "checked-out",
      "cancelled",
      "completed",
    ];

    if (
      !allowedStatuses.includes(
        bookingStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid booking status",
      });
    }

    const booking =
      await Booking.findById(
        req.params.id
      ).populate(
        "accommodation",
        "owner"
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const isOwner =
      booking.accommodation?.owner?.toString() ===
      req.user.id.toString();

    const isAdmin =
      req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to update this booking",
      });
    }

    if (
      bookingStatus === "confirmed" &&
      booking.paymentStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A booking must be paid before it can be confirmed",
      });
    }

    if (
      booking.bookingStatus ===
        "completed" &&
      bookingStatus !== "completed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A completed booking cannot be changed",
      });
    }

    booking.bookingStatus =
      bookingStatus;

    await booking.save();

    return res.status(200).json({
      success: true,
      message:
        "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    console.error(
      "Update booking status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update booking status",
    });
  }
};
