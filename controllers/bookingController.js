import Booking from "../models/bookings.js";
import Accommodation from "../models/accommodations.js";

const TRIPGUARD_FEE_RATE = 10;

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
     * Example:
     *
     * Accommodation = ₦180,000
     * TripGuard 10% = ₦18,000
     * Traveller pays = ₦198,000
     */

    const accommodationAmount =
      totalNights *
      property.pricePerNight;

    const tripguardFee =
      Math.round(
        accommodationAmount *
          (TRIPGUARD_FEE_RATE / 100) *
          100
      ) / 100;

    const totalAmount =
      accommodationAmount +
      tripguardFee;

    // Prevent double booking.
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

    const bookingReference =
      `TG-${Date.now()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

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

        /*
         * Financial breakdown
         */
        accommodationAmount,

        tripguardFee,

        /*
         * Final amount paid by traveller
         */
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
        "name images pricePerNight location checkInTime checkOutTime"
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
}