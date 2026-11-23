import Accommodation from "../models/accommodations.js";
import Booking from "../models/bookings.js";

export const getOwnerDashboard = async (req, res) => {
  try {
    // -----------------------------------------
    // 1. Make sure the authenticated user is an owner
    // -----------------------------------------
    if (req.user.role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Owner account required.",
      });
    }

    const ownerId = req.user._id;

    // -----------------------------------------
    // 2. Get all accommodations belonging to owner
    // -----------------------------------------
    const accommodations = await Accommodation.find({
      owner: ownerId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const accommodationIds = accommodations.map(
      (accommodation) => accommodation._id
    );

    // -----------------------------------------
    // 3. Get all bookings belonging to owner's properties
    // -----------------------------------------
    const bookings = await Booking.find({
      accommodation: { $in: accommodationIds },
    })
      .populate("guest", "firstName lastName email phone profileImage")
      .populate(
        "accommodation",
        "name images pricePerNight location type"
      )
      .sort({ createdAt: -1 })
      .lean();

    // -----------------------------------------
    // 4. Calculate booking statistics
    // -----------------------------------------
    const totalBookings = bookings.length;

    const pendingBookings = bookings.filter(
      (booking) => booking.bookingStatus === "pending"
    ).length;

    const confirmedBookings = bookings.filter(
      (booking) => booking.bookingStatus === "confirmed"
    ).length;

    const completedBookings = bookings.filter(
      (booking) =>
        booking.bookingStatus === "completed" ||
        booking.bookingStatus === "checked-out"
    ).length;

    const cancelledBookings = bookings.filter(
      (booking) => booking.bookingStatus === "cancelled"
    ).length;

    // -----------------------------------------
    // 5. Calculate earnings
    // -----------------------------------------
    //
    // accommodationAmount is the amount belonging
    // to the accommodation before TripGuard's fee.
    //
    // Only paid bookings count toward earnings.
    //
    const totalEarnings = bookings
      .filter((booking) => booking.paymentStatus === "paid")
      .reduce(
        (total, booking) =>
          total + (booking.accommodationAmount || 0),
        0
      );

    // -----------------------------------------
    // 6. Get recent bookings
    // -----------------------------------------
    const recentBookings = bookings.slice(0, 5);

    // -----------------------------------------
    // 7. Dashboard response
    // -----------------------------------------
    return res.status(200).json({
      success: true,

      stats: {
        totalProperties: accommodations.length,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
        totalEarnings,
      },

      properties: accommodations,

      recentBookings,
    });
  } catch (error) {
    console.error("Get owner dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load owner dashboard.",
    });
  }
};