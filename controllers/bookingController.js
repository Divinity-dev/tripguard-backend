import Booking from "../models/bookings.js";
import Accommodation from "../models/accommodations.js";
import { sendEmail } from "../utils/sendEmail.js";
import createNotification from "../utils/createNotification.js";

const TRIPGUARD_FEE_RATE = 10;

/*
 * ==================================================
 * HELPERS
 * ==================================================
 */

/*
 * Returns the date in Nigeria (Africa/Lagos) as:
 * YYYY-MM-DD
 */
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

    /*
     * Only approved and available accommodations
     * can be booked.
     */
    const property = await Accommodation.findOne({
      _id: accommodation,
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

    /*
     * Validate number of guests.
     */
    if (
      Number(guests) < 1 ||
      Number(guests) > property.maxGuests
    ) {
      return res.status(400).json({
        success: false,
        message: `This accommodation allows a maximum of ${property.maxGuests} guests`,
      });
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    const totalNights = Math.ceil(
      (checkOut - checkIn) / millisecondsPerDay
    );

    /*
     * ==================================================
     * PAYMENT CALCULATION
     * ==================================================
     *
     * Accommodation amount
     * + 10% TripGuard service fee
     * = Total amount traveller pays
     */

    const accommodationAmount =
      totalNights * property.pricePerNight;

    const serviceFee =
      Math.round(
        accommodationAmount *
          (TRIPGUARD_FEE_RATE / 100) *
          100
      ) / 100;

    const totalAmount =
      accommodationAmount + serviceFee;

    /*
     * ==================================================
     * PREVENT DOUBLE BOOKING
     * ==================================================
     *
     * Pending, confirmed and checked-in bookings
     * block the selected dates.
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
 * ==================================================
 * PREVENT BOOKING DURING OWNER-UNAVAILABLE DATES
 * ==================================================
 *
 * Owner-blocked dates are separate from Booking
 * records.
 *
 * A booking overlaps an unavailable range when:
 *
 * unavailable.startDate < checkOut
 * AND
 * unavailable.endDate > checkIn
 */

const conflictingUnavailableDate =
  property.unavailableDates?.find(
    (unavailable) =>
      unavailable.startDate < checkOut &&
      unavailable.endDate > checkIn
  );

if (conflictingUnavailableDate) {
  return res.status(409).json({
    success: false,
    message:
      "This accommodation is unavailable for the selected dates",
  });
}

    /*
     * Generate booking reference.
     */

    const bookingReference =
      `TG-${Date.now()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

    /*
     * ==================================================
     * CREATE BOOKING
     * ==================================================
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

    /*
     * Populate booking before returning it.
     */

    const populatedBooking =
      await Booking.findById(
        booking._id
      ).populate(
        "accommodation",
        "name images pricePerNight location checkInTime checkOutTime owner"
      );

    /*
     * ==================================================
     * NOTIFY PROPERTY OWNER
     * ==================================================
     */

    await createNotification({
      recipient: property.owner,

      type: "booking",

      title: "New booking request",

      message:
        `A traveller has created a booking for ${property.name}. Booking reference: ${booking.bookingReference}.`,

      booking: booking._id,

      accommodation: property._id,

      priority: "high",

      actionUrl:
        `/owner/bookings/${booking._id}`,
    });

    /*
     * ==================================================
     * NOTIFY TRAVELLER
     * ==================================================
     */

    await createNotification({
      recipient: req.user.id,

      type: "booking",

      title: "Booking created",

      message:
        `Your booking for ${property.name} has been created successfully. Please complete payment to confirm your booking.`,

      booking: booking._id,

      accommodation: property._id,

      priority: "normal",

      actionUrl:
        `/traveller/bookings/${booking._id}`,
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: populatedBooking,
    });
  } catch (error) {
    console.error(
      "Create booking error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create booking",
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
      message: "Unable to retrieve bookings",
    });
  }
};

/*
 * ==================================================
 * GET OWNER BOOKINGS
 * ==================================================
 */

export const getOwnerBookings = async (
  req,
  res
) => {
  try {
    /*
     * Find accommodations belonging
     * to the logged-in owner.
     */

    const accommodations =
      await Accommodation.find({
        owner: req.user.id,
      }).select("_id");

    const accommodationIds =
      accommodations.map(
        (accommodation) =>
          accommodation._id
      );

    /*
     * Find bookings belonging to those
     * accommodations.
     */

    const bookings =
      await Booking.find({
        accommodation: {
          $in: accommodationIds,
        },
      })
        .populate(
          "accommodation",
          "name images pricePerNight location checkInTime checkOutTime owner"
        )
        .populate(
          "guest",
          "firstName lastName email phone profileImage"
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
      "Get owner bookings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve owner bookings",
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
          "accommodation.owner",
          "firstName lastName email phone"
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

    /*
     * Because accommodation.owner is populated
     * above, use its _id when checking ownership.
     */

    const ownerId =
      booking.accommodation?.owner?._id ||
      booking.accommodation?.owner;

    const isOwner =
      ownerId?.toString() ===
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
     * Find the accommodation owner.
     */

    const accommodation =
      await Accommodation.findById(
        booking.accommodation
      ).select("owner name");

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found",
      });
    }

    /*
     * The booking can be cancelled by:
     *
     * 1. The traveller
     * 2. The accommodation owner
     */

    const isGuest =
      booking.guest.toString() ===
      req.user.id.toString();

    const isOwner =
      accommodation.owner.toString() ===
      req.user.id.toString();

    if (!isGuest && !isOwner) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to cancel this booking",
      });
    }

    /*
     * Owners can only cancel pending bookings.
     */

    if (
      isOwner &&
      booking.bookingStatus !== "pending"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Owners can only cancel pending bookings",
      });
    }

    /*
     * Already cancelled.
     */

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

    /*
     * Once the stay has started or ended,
     * the booking cannot be cancelled.
     */

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

    /*
     * Cancel the booking.
     */

    booking.bookingStatus =
      "cancelled";

    booking.cancellationReason =
      cancellationReason?.trim() || "";

    booking.cancelledAt =
      new Date();

    await booking.save();

    /*
     * ==================================================
     * NOTIFY THE OTHER PARTY
     * ==================================================
     */

    if (isOwner) {
      await createNotification({
        recipient: booking.guest,

        type: "booking",

        title: "Booking cancelled",

        message:
          `Your booking ${booking.bookingReference} has been cancelled by the property owner.`,

        booking: booking._id,

        accommodation:
          booking.accommodation,

        priority: "high",

        actionUrl:
          `/traveller/bookings/${booking._id}`,
      });
    } else {
      await createNotification({
        recipient:
          accommodation.owner,

        type: "booking",

        title: "Booking cancelled",

        message:
          `Booking ${booking.bookingReference} has been cancelled by the traveller.`,

        booking: booking._id,

        accommodation:
          booking.accommodation,

        priority: "high",

        actionUrl:
          `/owner/bookings/${booking._id}`,
      });
    }

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
 * CHECK IN BOOKING
 * ==================================================
 *
 * IMPORTANT:
 *
 * Only the traveller can perform this action.
 *
 * This is the ONLY place where a booking should
 * transition from:
 *
 * confirmed → checked-in
 *
 * TripGuard protection is activated here.
 */

export const checkInBooking = async (
  req,
  res
) => {
  try {
    const { safetyEmail } =
      req.body;

    /*
     * ==================================================
     * VALIDATE SAFETY CONTACT EMAIL
     * ==================================================
     */

    if (!safetyEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide the email address of your relative or trusted contact",
      });
    }

    const normalizedEmail =
      safetyEmail
        .trim()
        .toLowerCase();

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid email address",
      });
    }

    /*
     * ==================================================
     * FIND BOOKING
     * ==================================================
     */

    const booking =
      await Booking.findById(
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
     * ==================================================
     * VERIFY TRAVELLER
     * ==================================================
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
     * ==================================================
     * VERIFY PAYMENT
     * ==================================================
     */

    if (
      booking.paymentStatus !== "paid"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking must be paid before you can check in",
      });
    }

    /*
     * ==================================================
     * VERIFY BOOKING STATUS
     * ==================================================
     */

    if (
      booking.bookingStatus ===
      "checked-in"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You have already checked in to this accommodation",
      });
    }

    if (
      booking.bookingStatus !==
      "confirmed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking must be confirmed before you can check in",
      });
    }

    /*
     * ==================================================
     * VERIFY CHECK-IN DATE
     * ==================================================
     */

    const today =
      getNigeriaDateKey();

    const checkInDate =
      getNigeriaDateKey(
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
     * ==================================================
     * STORE SAFETY CONTACT
     * ==================================================
     */

    booking.safetyContact = {
      ...(booking.safetyContact?.toObject
        ? booking.safetyContact.toObject()
        : booking.safetyContact || {}),

      email: normalizedEmail,
    };

    /*
     * ==================================================
     * PREPARE EMAIL DETAILS
     * ==================================================
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

    /*
     * ==================================================
     * SEND CHECK-IN SAFETY EMAIL
     * ==================================================
     *
     * We intentionally send the email BEFORE changing
     * the booking status.
     *
     * If the email fails, the booking remains confirmed
     * and TripGuard protection is not activated.
     */

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
              <strong>
                ${req.user.firstName || "The traveller"}
              </strong>
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
     * ==================================================
     * ACTIVATE TRIPGUARD PROTECTION
     * ==================================================
     */

    booking.bookingStatus =
      "checked-in";

    booking.safetyContact.protectionCheckInAt =
      new Date();

    booking.safetyNotifications = {
      enabled: true,

      checkInNotificationSent: true,

      checkOutNotificationSent:
        booking.safetyNotifications
          ?.checkOutNotificationSent ||
        false,
    };

    await booking.save();

    /*
     * ==================================================
     * NOTIFY OWNER
     * ==================================================
     */

    if (accommodation?.owner) {
      await createNotification({
        recipient:
          accommodation.owner,

        type: "booking",

        title: "Traveller checked in",

        message:
          `The traveller for booking ${booking.bookingReference} has checked in to ${accommodation.name}.`,

        booking: booking._id,

        accommodation:
          accommodation._id,

        priority: "normal",

        actionUrl:
          `/owner/bookings/${booking._id}`,
      });
    }

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
 * CHECK OUT BOOKING
 * ==================================================
 *
 * IMPORTANT:
 *
 * Only the traveller can perform this action.
 *
 * This is the ONLY place where a booking should
 * transition from:
 *
 * checked-in → checked-out
 *
 * TripGuard protection ends here.
 */

export const checkOutBooking = async (
  req,
  res
) => {
  try {
    /*
     * ==================================================
     * FIND BOOKING
     * ==================================================
     */

    const booking =
      await Booking.findById(
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
     * ==================================================
     * VERIFY TRAVELLER
     * ==================================================
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
     * ==================================================
     * VERIFY CHECK-IN STATUS
     * ==================================================
     */

    if (
      booking.bookingStatus !==
      "checked-in"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You must be checked in before you can check out",
      });
    }

    /*
     * ==================================================
     * VERIFY SAFETY CONTACT
     * ==================================================
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
     * ==================================================
     * VERIFY CHECK-OUT DATE
     * ==================================================
     */

    const today =
      getNigeriaDateKey();

    const checkOutDate =
      getNigeriaDateKey(
        booking.checkOutDate
      );

    if (today !== checkOutDate) {
      return res.status(400).json({
        success: false,
        message:
          `You can only check out on ${checkOutDate}`,
      });
    }

    /*
     * ==================================================
     * PREPARE EMAIL DETAILS
     * ==================================================
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

    /*
     * ==================================================
     * SEND CHECK-OUT SAFETY EMAIL
     * ==================================================
     *
     * The booking remains checked-in if the email fails.
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
              <strong>
                ${req.user.firstName || "The traveller"}
              </strong>
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
     * ==================================================
     * END TRIPGUARD PROTECTION
     * ==================================================
     */

    booking.bookingStatus =
      "checked-out";

    booking.safetyContact.protectionCheckOutAt =
      new Date();

    booking.safetyNotifications = {
      enabled: true,

      checkInNotificationSent:
        booking.safetyNotifications
          ?.checkInNotificationSent ||
        false,

      checkOutNotificationSent: true,
    };

    await booking.save();

    /*
     * ==================================================
     * NOTIFY OWNER
     * ==================================================
     */

    if (accommodation?.owner) {
      await createNotification({
        recipient:
          accommodation.owner,

        type: "booking",

        title: "Traveller checked out",

        message:
          `The traveller for booking ${booking.bookingReference} has checked out of ${accommodation.name}.`,

        booking: booking._id,

        accommodation:
          accommodation._id,

        priority: "normal",

        actionUrl:
          `/owner/bookings/${booking._id}`,
      });
    }

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
 *
 * IMPORTANT:
 *
 * This function is for OWNER / ADMIN management.
 *
 * Owners/admins MUST NOT be able to manually set:
 *
 *     checked-in
 *     checked-out
 *
 * Those states are controlled exclusively by:
 *
 *     checkInBooking()
 *     checkOutBooking()
 *
 * Therefore:
 *
 * OWNER / ADMIN:
 *
 * pending → confirmed
 * pending → cancelled
 * confirmed → cancelled
 * checked-out → completed
 *
 * TRAVELLER:
 *
 * confirmed → checked-in
 * checked-in → checked-out
 */

export const updateBookingStatus = async (
  req,
  res
) => {
  try {
    const {
      bookingStatus,
    } = req.body;

    /*
     * ==================================================
     * ALLOWED ADMIN / OWNER STATUSES
     * ==================================================
     *
     * Notice that checked-in and checked-out
     * are intentionally NOT here.
     */

    const allowedStatuses = [
      "pending",
      "confirmed",
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
          "Invalid booking status. Check-in and check-out must be performed by the traveller.",
      });
    }

    /*
     * ==================================================
     * FIND BOOKING
     * ==================================================
     */

    const booking =
      await Booking.findById(
        req.params.id
      ).populate(
        "accommodation",
        "owner name"
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    /*
     * ==================================================
     * VERIFY OWNER / ADMIN
     * ==================================================
     */

    const isOwner =
      booking.accommodation?.owner
        ?.toString() ===
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

    /*
     * ==================================================
     * COMPLETED BOOKING
     * ==================================================
     *
     * Once completed, it cannot be modified.
     */

    if (
      booking.bookingStatus ===
      "completed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A completed booking cannot be changed",
      });
    }

    /*
     * ==================================================
     * CONFIRM BOOKING
     * ==================================================
     *
     * Payment MUST be completed first.
     */

    if (
      bookingStatus === "confirmed"
    ) {
      if (
        booking.paymentStatus !== "paid"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A booking must be paid before it can be confirmed",
        });
      }

      /*
       * Only pending bookings can be confirmed.
       */

      if (
        booking.bookingStatus !==
        "pending"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only pending bookings can be confirmed",
        });
      }
    }

    /*
     * ==================================================
     * CANCEL BOOKING
     * ==================================================
     *
     * The owner/admin status endpoint can cancel
     * pending or confirmed bookings.
     *
     * It cannot cancel a stay that has already started.
     */

    if (
      bookingStatus === "cancelled"
    ) {
      if (
        booking.bookingStatus ===
          "checked-in" ||
        booking.bookingStatus ===
          "checked-out"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A booking that has already entered the stay cannot be cancelled",
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

      booking.cancellationReason =
        booking.cancellationReason ||
        "Cancelled by property owner or administrator";

      booking.cancelledAt =
        new Date();
    }

    /*
     * ==================================================
     * COMPLETE BOOKING
     * ==================================================
     *
     * A booking can only become completed
     * AFTER the traveller has checked out.
     *
     * This means:
     *
     * checked-out → completed
     *
     * is allowed.
     */

    if (
      bookingStatus === "completed"
    ) {
      if (
        booking.bookingStatus !==
        "checked-out"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A booking can only be completed after the traveller has checked out",
        });
      }
    }

    /*
     * ==================================================
     * PREVENT INVALID BACKWARD MOVEMENTS
     * ==================================================
     */

    if (
      booking.bookingStatus ===
      "checked-in"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking is currently active. The traveller must check out before its status can be changed.",
      });
    }

    /*
     * A checked-out booking can only become completed.
     */

    if (
      booking.bookingStatus ===
        "checked-out" &&
      bookingStatus !== "completed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A checked-out booking can only be marked as completed",
      });
    }

    /*
     * ==================================================
     * UPDATE STATUS
     * ==================================================
     */

    booking.bookingStatus =
      bookingStatus;

    await booking.save();

    /*
     * ==================================================
     * NOTIFY TRAVELLER
     * ==================================================
     */

    let notificationTitle = "";
    let notificationMessage = "";

    if (
      bookingStatus === "confirmed"
    ) {
      notificationTitle =
        "Booking confirmed";

      notificationMessage =
        `Your booking ${booking.bookingReference} has been confirmed by the property.`;
    }

    if (
      bookingStatus === "cancelled"
    ) {
      notificationTitle =
        "Booking cancelled";

      notificationMessage =
        `Your booking ${booking.bookingReference} has been cancelled.`;
    }

    if (
      bookingStatus === "completed"
    ) {
      notificationTitle =
        "Booking completed";

      notificationMessage =
        `Your booking ${booking.bookingReference} has been completed. Thank you for using TripGuard.`;
    }

    /*
     * Only send a notification when we have
     * a meaningful status message.
     */

    if (
      notificationTitle &&
      notificationMessage
    ) {
      await createNotification({
        recipient: booking.guest,

        type: "booking",

        title:
          notificationTitle,

        message:
          notificationMessage,

        booking: booking._id,

        accommodation:
          booking.accommodation?._id ||
          booking.accommodation,

        priority:
          bookingStatus === "cancelled"
            ? "high"
            : "normal",

        actionUrl:
          `/traveller/bookings/${booking._id}`,
      });
    }

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