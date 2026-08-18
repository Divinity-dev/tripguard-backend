import Booking from "../models/bookings.js";
import Accommodation from "../models/accommodations.js";
import { sendEmail } from "../utils/sendEmail.js";

const TRIPGUARD_FEE_RATE = 10;

const getNigeriaDateKey = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
};

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
 * CHECK IN BOOKING / ACTIVATE TRIPGUARD PROTECTION
 * ==================================================
 */

export const checkInBooking = async (req, res) => {
  try {
    const { safetyEmail } = req.body;

    if (!safetyEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide the email address of your relative or trusted contact",
      });
    }

    const normalizedEmail = safetyEmail
      .trim()
      .toLowerCase();

    /*
     * Basic email validation
     */

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    /*
     * Find the booking and populate the accommodation.
     */

    const booking = await Booking.findById(
      req.params.id
    ).populate(
      "accommodation",
      "name images location checkInTime checkOutTime owner"
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    /*
     * Only the traveller who created
     * the booking can check in.
     */

    if (
      booking.guest.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to check in to this booking",
      });
    }

    /*
     * The booking must be paid before
     * TripGuard protection can be activated.
     */

    if (booking.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message:
          "This booking must be paid before you can check in",
      });
    }

    /*
     * The booking must already be confirmed
     * by the accommodation owner.
     */

    if (booking.bookingStatus !== "confirmed") {
      return res.status(400).json({
        success: false,
        message:
          "This booking must be confirmed before you can check in",
      });
    }

    /*
     * Prevent duplicate check-ins.
     */

    if (booking.bookingStatus === "checked-in") {
      return res.status(400).json({
        success: false,
        message:
          "You have already checked in to this accommodation",
      });
    }

    /*
     * Check that today is the actual check-in date.
     */

    const today = getNigeriaDateKey();

    const checkInDate = getNigeriaDateKey(
      booking.checkInDate
    );

    if (today !== checkInDate) {
      return res.status(400).json({
        success: false,
        message:
          `You can only check in on ${checkInDate}`,
      });
    }

    /*
     * Store the safety contact.
     *
     * We intentionally collect the email here,
     * rather than activating protection when the
     * booking is created.
     */

    booking.safetyContact = {
      ...(booking.safetyContact?.toObject
        ? booking.safetyContact.toObject()
        : booking.safetyContact || {}),
      email: normalizedEmail,
    };

    /*
     * Send the TripGuard check-in notification.
     */

    const accommodation =
      booking.accommodation;

    const location =
      accommodation?.location;

    const locationText = [
      location?.address,
      location?.city,
      location?.state,
    ]
      .filter(Boolean)
      .join(", ");

    await sendEmail({
      to: normalizedEmail,

      subject:
        "TripGuard Safety Notification - Traveller Checked In",

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a765; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">
              TripGuard
            </h1>
          </div>

          <div style="padding: 30px 24px;">
            <h2 style="margin-top: 0;">
              Safety Notification
            </h2>

            <p>
              This is a TripGuard safety notification.
            </p>

            <p>
              <strong>${req.user.firstName || "The traveller"}</strong>
              has checked in to the following accommodation:
            </p>

            <div style="background: #f7f9f8; border-radius: 10px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px;">
                <strong>Accommodation:</strong>
                ${accommodation?.name || "Accommodation"}
              </p>

              ${
                locationText
                  ? `
                    <p style="margin: 0 0 8px;">
                      <strong>Location:</strong>
                      ${locationText}
                    </p>
                  `
                  : ""
              }

              <p style="margin: 0 0 8px;">
                <strong>Check-in date:</strong>
                ${getNigeriaDateKey(
                  booking.checkInDate
                )}
              </p>

              <p style="margin: 0;">
                <strong>Booking reference:</strong>
                ${booking.bookingReference}
              </p>
            </div>

            <p>
              This notification was sent because you were
              provided as the traveller's safety contact.
            </p>

            <p>
              If the traveller cannot be reached, this
              information may help establish where they
              were last known to be staying.
            </p>

            <p style="margin-top: 30px;">
              Stay safe,<br />
              <strong>TripGuard</strong>
            </p>
          </div>
        </div>
      `,
    });

    /*
     * Only change the booking status after the
     * notification has successfully been sent.
     */

   booking.bookingStatus = "checked-in";

booking.safetyContact.protectionCheckInAt = new Date();

booking.safetyNotifications = {
  enabled: true,
  checkInNotificationSent: true,
  checkOutNotificationSent:
    booking.safetyNotifications
      ?.checkOutNotificationSent || false,
};

    await booking.save();

    return res.status(200).json({
      success: true,
      message:
        "Check-in successful. Your safety contact has been notified.",
      booking,
    });
  } catch (error) {
    console.error(
      "Check-in booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to complete check-in",
    });
  }
};

/*
 * ==================================================
 * CHECK OUT BOOKING / SEND SAFETY NOTIFICATION
 * ==================================================
 */

export const checkOutBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(
      req.params.id
    ).populate(
      "accommodation",
      "name images location checkInTime checkOutTime owner"
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    /*
     * Only the traveller who created
     * the booking can check out.
     */

    if (
      booking.guest.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to check out from this booking",
      });
    }

    /*
     * Traveller must currently be checked in.
     */

    if (booking.bookingStatus !== "checked-in") {
      return res.status(400).json({
        success: false,
        message:
          "You must be checked in before you can check out",
      });
    }

    /*
     * We need the safety contact that was
     * supplied during check-in.
     */

    const safetyEmail =
      booking.safetyContact?.email;

    if (!safetyEmail) {
      return res.status(400).json({
        success: false,
        message:
          "No safety contact is associated with this booking",
      });
    }

    /*
     * Check that today is the actual check-out date.
     */

    const today = getNigeriaDateKey();

    const checkOutDate = getNigeriaDateKey(
      booking.checkOutDate
    );

    if (today !== checkOutDate) {
      return res.status(400).json({
        success: false,
        message:
          `You can only check out on ${checkOutDate}`,
      });
    }

    const accommodation =
      booking.accommodation;

    const location =
      accommodation?.location;

    const locationText = [
      location?.address,
      location?.city,
      location?.state,
    ]
      .filter(Boolean)
      .join(", ");

    /*
     * Send checkout notification.
     */

    await sendEmail({
      to: safetyEmail,

      subject:
        "TripGuard Safety Notification - Traveller Checked Out",

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a765; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">
              TripGuard
            </h1>
          </div>

          <div style="padding: 30px 24px;">
            <h2 style="margin-top: 0;">
              Safety Notification
            </h2>

            <p>
              This is a TripGuard safety notification.
            </p>

            <p>
              <strong>${req.user.firstName || "The traveller"}</strong>
              has checked out of the following accommodation:
            </p>

            <div style="background: #f7f9f8; border-radius: 10px; padding: 18px; margin: 20px 0;">
              <p style="margin: 0 0 8px;">
                <strong>Accommodation:</strong>
                ${accommodation?.name || "Accommodation"}
              </p>

              ${
                locationText
                  ? `
                    <p style="margin: 0 0 8px;">
                      <strong>Location:</strong>
                      ${locationText}
                    </p>
                  `
                  : ""
              }

              <p style="margin: 0 0 8px;">
                <strong>Check-out date:</strong>
                ${getNigeriaDateKey(
                  booking.checkOutDate
                )}
              </p>

              <p style="margin: 0;">
                <strong>Booking reference:</strong>
                ${booking.bookingReference}
              </p>
            </div>

            <p>
              The traveller has now left this accommodation.
            </p>

            <p>
              This notification was sent because you were
              provided as the traveller's safety contact.
            </p>

            <p style="margin-top: 30px;">
              Stay safe,<br />
              <strong>TripGuard</strong>
            </p>
          </div>
        </div>
      `,
    });

    /*
     * Only mark the booking as checked out
     * after the email has successfully been sent.
     */

   booking.bookingStatus = "checked-out";

booking.safetyContact.protectionCheckOutAt = new Date();

booking.safetyNotifications = {
  enabled: true,
  checkInNotificationSent:
    booking.safetyNotifications
      ?.checkInNotificationSent || false,
  checkOutNotificationSent: true,
};

await booking.save();

    return res.status(200).json({
      success: true,
      message:
        "Check-out successful. Your safety contact has been notified.",
      booking,
    });
  } catch (error) {
    console.error(
      "Check-out booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to complete check-out",
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
