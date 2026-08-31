import User from "../models/users.js";
import Accommodation from "../models/accommodations.js";
import Booking from "../models/bookings.js";
import Payment from "../models/payments.js";
import ContactMessage from "../models/contactmessages.js";
import Notification from "../models/notifications.js";

// ==========================================================
// ADMIN DASHBOARD
// ==========================================================

export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    const daysInMonth = Math.ceil(
      (nextMonthStart - monthStart) /
        (1000 * 60 * 60 * 24)
    );

    // ------------------------------------------------------
    // GET ADMIN USERS
    // ------------------------------------------------------

    const adminUsers = await User.find({
      role: "admin",
    }).select("_id");

    const adminIds = adminUsers.map(
      (admin) => admin._id
    );

    const [
      totalUsers,
      totalOwners,
      totalAdmins,
      totalAccommodations,
      pendingAccommodations,
      totalBookings,
      pendingBookings,
      successfulPayments,
      totalContactMessages,
      unreadContactMessages,
      recentBookings,
      recentNotifications,
      topAccommodations,
      recentUsers,
    ] = await Promise.all([
      // ----------------------------------------------------
      // USERS
      // ----------------------------------------------------

      User.countDocuments({
        role: "user",
      }),

      // ----------------------------------------------------
      // OWNERS
      // ----------------------------------------------------

      User.countDocuments({
        role: "owner",
      }),

      // ----------------------------------------------------
      // ADMINS
      // ----------------------------------------------------

      User.countDocuments({
        role: "admin",
      }),

      // ----------------------------------------------------
      // ACCOMMODATIONS
      // ----------------------------------------------------

      Accommodation.countDocuments(),

      Accommodation.countDocuments({
        status: "pending",
      }),

      // ----------------------------------------------------
      // PAID BOOKINGS
      // ----------------------------------------------------

      Booking.countDocuments({
        paymentStatus: "paid",
      }),

      // ----------------------------------------------------
      // PAID BOOKINGS STILL PENDING
      // ----------------------------------------------------

      Booking.countDocuments({
        paymentStatus: "paid",
        bookingStatus: "pending",
      }),

      // ----------------------------------------------------
      // SUCCESSFUL PAYMENTS
      // ----------------------------------------------------

      Payment.countDocuments({
        status: "successful",
      }),

      // ----------------------------------------------------
      // CONTACT MESSAGES
      // ----------------------------------------------------

      ContactMessage.countDocuments(),

      ContactMessage.countDocuments({
        status: "unread",
      }),

      // ----------------------------------------------------
      // RECENT PAID BOOKINGS
      // ----------------------------------------------------

      Booking.find({
        paymentStatus: "paid",
      })
        .populate(
          "guest",
          "firstName lastName email phone"
        )
        .populate(
          "accommodation",
          "name location pricePerNight"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5),

      // ----------------------------------------------------
      // RECENT ADMIN NOTIFICATIONS
      // ----------------------------------------------------

      adminIds.length > 0
        ? Notification.find({
            recipient: {
              $in: adminIds,
            },
          })
            .populate(
              "recipient",
              "firstName lastName email"
            )
            .populate(
              "booking",
              "bookingReference bookingStatus"
            )
            .populate(
              "accommodation",
              "name"
            )
            .sort({
              createdAt: -1,
            })
            .limit(4)
        : [],

      // ----------------------------------------------------
      // TOP ACCOMMODATIONS THIS MONTH
      // ----------------------------------------------------

      Booking.aggregate([
        {
          $match: {
            paymentStatus: "paid",

            bookingStatus: {
              $ne: "cancelled",
            },

            checkInDate: {
              $lt: nextMonthStart,
            },

            checkOutDate: {
              $gt: monthStart,
            },
          },
        },

        {
          $addFields: {
            effectiveCheckIn: {
              $cond: [
                {
                  $gt: [
                    "$checkInDate",
                    monthStart,
                  ],
                },
                "$checkInDate",
                monthStart,
              ],
            },

            effectiveCheckOut: {
              $cond: [
                {
                  $lt: [
                    "$checkOutDate",
                    nextMonthStart,
                  ],
                },
                "$checkOutDate",
                nextMonthStart,
              ],
            },
          },
        },

        {
          $addFields: {
            occupiedNights: {
              $dateDiff: {
                startDate:
                  "$effectiveCheckIn",

                endDate:
                  "$effectiveCheckOut",

                unit: "day",
              },
            },
          },
        },

        {
          $group: {
            _id: "$accommodation",

            bookings: {
              $sum: 1,
            },

            revenue: {
              $sum: "$accommodationAmount",
            },

            occupiedNights: {
              $sum: "$occupiedNights",
            },
          },
        },

        {
          $lookup: {
            from: "accommodations",
            localField: "_id",
            foreignField: "_id",
            as: "accommodation",
          },
        },

        {
          $unwind: "$accommodation",
        },

        {
          $addFields: {
            occupancy: {
              $min: [
                100,
                {
                  $multiply: [
                    {
                      $divide: [
                        "$occupiedNights",
                        daysInMonth,
                      ],
                    },
                    100,
                  ],
                },
              ],
            },
          },
        },

        {
          $project: {
            _id: 1,

            name: "$accommodation.name",

            location:
              "$accommodation.location",

            bookings: 1,

            revenue: 1,

            occupancy: {
              $round: [
                "$occupancy",
                0,
              ],
            },
          },
        },

        {
          $sort: {
            bookings: -1,
            revenue: -1,
          },
        },

        {
          $limit: 4,
        },
      ]),

      // ----------------------------------------------------
      // RECENT USERS
      // ----------------------------------------------------

      User.find()
        .select(
          "firstName lastName email role isActive profileImage createdAt"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5),
    ]);

    // ------------------------------------------------------
    // TOTAL REVENUE
    // ------------------------------------------------------

    const revenueResult =
      await Payment.aggregate([
        {
          $match: {
            status: "successful",
          },
        },

        {
          $group: {
            _id: null,

            totalRevenue: {
              $sum: "$amount",
            },
          },
        },
      ]);

    const totalRevenue =
      revenueResult.length > 0
        ? revenueResult[0].totalRevenue
        : 0;

    // ------------------------------------------------------
    // LAST 7 DAYS PAID BOOKING CHART
    // ------------------------------------------------------

    const sevenDaysAgo = new Date();

    sevenDaysAgo.setDate(
      sevenDaysAgo.getDate() - 6
    );

    sevenDaysAgo.setHours(0, 0, 0, 0);

    const bookingChart =
      await Booking.aggregate([
        {
          $match: {
            createdAt: {
              $gte: sevenDaysAgo,
            },

            paymentStatus: "paid",

            bookingStatus: {
              $ne: "cancelled",
            },
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },

            bookings: {
              $sum: 1,
            },

            revenue: {
              $sum: "$totalAmount",
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },
      ]);

    // ------------------------------------------------------
    // RESPONSE
    // ------------------------------------------------------

    res.status(200).json({
      success: true,

      stats: {
        totalUsers,
        totalOwners,
        totalAdmins,

        totalAccommodations,
        pendingAccommodations,

        totalBookings,
        pendingBookings,

        successfulPayments,

        totalContactMessages,
        unreadContactMessages,

        totalRevenue,
      },

      recentBookings,

      recentUsers,

      recentNotifications,

      topAccommodations,

      bookingChart,
    });
  } catch (error) {
    console.error(
      "Get dashboard stats error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to retrieve dashboard statistics",
    });
  }
};

// ==========================================================
// ADMIN REPORTS
// ==========================================================

export const getAdminReports = async (req, res) => {
  try {
    const range =
      Number(req.query.range) || 30;

    const allowedRanges = [
      7,
      30,
      90,
      365,
    ];

    if (!allowedRanges.includes(range)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report range",
      });
    }

    const now = new Date();

    // ======================================================
    // CURRENT PERIOD
    // ======================================================

    const currentStart = new Date(now);

    currentStart.setDate(
      currentStart.getDate() -
        (range - 1)
    );

    currentStart.setHours(
      0,
      0,
      0,
      0
    );

    const currentEnd = new Date(now);

    currentEnd.setHours(
      23,
      59,
      59,
      999
    );

    // ======================================================
    // PREVIOUS PERIOD
    // ======================================================

    const previousEnd =
      new Date(currentStart);

    previousEnd.setMilliseconds(-1);

    const previousStart =
      new Date(previousEnd);

    previousStart.setDate(
      previousStart.getDate() -
        (range - 1)
    );

    previousStart.setHours(
      0,
      0,
      0,
      0
    );

    // ======================================================
    // MAIN STATISTICS
    // ======================================================

    const [
      currentRevenueResult,
      previousRevenueResult,
      currentBookings,
      previousBookings,
      newUsers,
      activeAccommodations,
      completedBookings,
      cancelledBookings,
      safetyNotifications,
    ] = await Promise.all([
      // ----------------------------------------------------
      // CURRENT REVENUE
      // ----------------------------------------------------

      Payment.aggregate([
        {
          $match: {
            status: "successful",

            createdAt: {
              $gte: currentStart,
              $lte: currentEnd,
            },
          },
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: "$amount",
            },
          },
        },
      ]),

      // ----------------------------------------------------
      // PREVIOUS REVENUE
      // ----------------------------------------------------

      Payment.aggregate([
        {
          $match: {
            status: "successful",

            createdAt: {
              $gte: previousStart,
              $lte: previousEnd,
            },
          },
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: "$amount",
            },
          },
        },
      ]),

      // ----------------------------------------------------
      // CURRENT BOOKINGS
      // ----------------------------------------------------

      Booking.countDocuments({
        createdAt: {
          $gte: currentStart,
          $lte: currentEnd,
        },

        paymentStatus: "paid",

        bookingStatus: {
          $ne: "cancelled",
        },
      }),

      // ----------------------------------------------------
      // PREVIOUS BOOKINGS
      // ----------------------------------------------------

      Booking.countDocuments({
        createdAt: {
          $gte: previousStart,
          $lte: previousEnd,
        },

        paymentStatus: "paid",

        bookingStatus: {
          $ne: "cancelled",
        },
      }),

      // ----------------------------------------------------
      // NEW USERS
      // ----------------------------------------------------

      User.countDocuments({
        role: "user",

        createdAt: {
          $gte: currentStart,
          $lte: currentEnd,
        },
      }),

      // ----------------------------------------------------
      // ACTIVE ACCOMMODATIONS
      // ----------------------------------------------------

      Accommodation.countDocuments({
        isAvailable: true,
      }),

      // ----------------------------------------------------
      // COMPLETED BOOKINGS
      // ----------------------------------------------------

      Booking.countDocuments({
        bookingStatus: "completed",

        paymentStatus: "paid",

        createdAt: {
          $gte: currentStart,
          $lte: currentEnd,
        },
      }),

      // ----------------------------------------------------
      // CANCELLED BOOKINGS
      // ----------------------------------------------------

      Booking.countDocuments({
        bookingStatus: "cancelled",

        createdAt: {
          $gte: currentStart,
          $lte: currentEnd,
        },
      }),

      // ----------------------------------------------------
      // SAFETY NOTIFICATIONS
      // ----------------------------------------------------

      Booking.aggregate([
        {
          $match: {
            createdAt: {
              $gte: currentStart,
              $lte: currentEnd,
            },
          },
        },

        {
          $project: {
            checkInSent: {
              $cond: [
                "$safetyNotifications.checkInNotificationSent",
                1,
                0,
              ],
            },

            checkOutSent: {
              $cond: [
                "$safetyNotifications.checkOutNotificationSent",
                1,
                0,
              ],
            },
          },
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: {
                $add: [
                  "$checkInSent",
                  "$checkOutSent",
                ],
              },
            },
          },
        },
      ]),
    ]);

    const revenue =
      currentRevenueResult.length > 0
        ? currentRevenueResult[0].total
        : 0;

    const previousRevenue =
      previousRevenueResult.length > 0
        ? previousRevenueResult[0].total
        : 0;

    const safetyCount =
      safetyNotifications.length > 0
        ? safetyNotifications[0].total
        : 0;

    // ======================================================
    // BOOKING TREND
    // ======================================================

    let bookingTrend;

    if (range === 7) {
      bookingTrend =
        await Booking.aggregate([
          {
            $match: {
              createdAt: {
                $gte: currentStart,
                $lte: currentEnd,
              },

              paymentStatus: "paid",

              bookingStatus: {
                $ne: "cancelled",
              },
            },
          },

          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },

              bookings: {
                $sum: 1,
              },

              revenue: {
                $sum: "$totalAmount",
              },
            },
          },

          {
            $sort: {
              _id: 1,
            },
          },
        ]);
    } else if (range === 30) {
      bookingTrend =
        await Booking.aggregate([
          {
            $match: {
              createdAt: {
                $gte: currentStart,
                $lte: currentEnd,
              },

              paymentStatus: "paid",

              bookingStatus: {
                $ne: "cancelled",
              },
            },
          },

          {
            $group: {
              _id: {
                $isoWeek: "$createdAt",
              },

              bookings: {
                $sum: 1,
              },

              revenue: {
                $sum: "$totalAmount",
              },
            },
          },

          {
            $sort: {
              _id: 1,
            },
          },
        ]);
    } else {
      bookingTrend =
        await Booking.aggregate([
          {
            $match: {
              createdAt: {
                $gte: currentStart,
                $lte: currentEnd,
              },

              paymentStatus: "paid",

              bookingStatus: {
                $ne: "cancelled",
              },
            },
          },

          {
            $group: {
              _id: {
                year: {
                  $year: "$createdAt",
                },

                month: {
                  $month: "$createdAt",
                },
              },

              bookings: {
                $sum: 1,
              },

              revenue: {
                $sum: "$totalAmount",
              },
            },
          },

          {
            $sort: {
              "_id.year": 1,
              "_id.month": 1,
            },
          },
        ]);
    }

    // ======================================================
    // FORMAT BOOKING TREND
    // ======================================================

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    let formattedBookingTrend;

    if (range === 7) {
      formattedBookingTrend =
        bookingTrend.map((item) => {
          const date = new Date(item._id);

          return {
            day: date.toLocaleDateString(
              "en-US",
              {
                weekday: "short",
              }
            ),

            bookings: item.bookings,

            revenue: item.revenue,
          };
        });
    } else if (range === 30) {
      formattedBookingTrend =
        bookingTrend.map((item) => ({
          day: `W${item._id}`,

          bookings: item.bookings,

          revenue: item.revenue,
        }));
    } else {
      formattedBookingTrend =
        bookingTrend.map((item) => ({
          day: monthNames[
            item._id.month - 1
          ],

          bookings: item.bookings,

          revenue: item.revenue,
        }));
    }

    // ======================================================
    // ACCOMMODATION PERFORMANCE
    // ======================================================

    const periodDays =
      Math.ceil(
        (currentEnd - currentStart) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    const accommodationPerformance =
      await Booking.aggregate([
        {
          $match: {
            bookingStatus: {
              $ne: "cancelled",
            },

            paymentStatus: "paid",

            checkInDate: {
              $lt: currentEnd,
            },

            checkOutDate: {
              $gt: currentStart,
            },
          },
        },

        {
          $addFields: {
            effectiveCheckIn: {
              $cond: [
                {
                  $gt: [
                    "$checkInDate",
                    currentStart,
                  ],
                },

                "$checkInDate",

                currentStart,
              ],
            },

            effectiveCheckOut: {
              $cond: [
                {
                  $lt: [
                    "$checkOutDate",
                    currentEnd,
                  ],
                },

                "$checkOutDate",

                currentEnd,
              ],
            },
          },
        },

        {
          $addFields: {
            occupiedNights: {
              $dateDiff: {
                startDate:
                  "$effectiveCheckIn",

                endDate:
                  "$effectiveCheckOut",

                unit: "day",
              },
            },
          },
        },

        {
          $group: {
            _id: "$accommodation",

            bookings: {
              $sum: 1,
            },

            revenue: {
              $sum: "$accommodationAmount",
            },

            occupiedNights: {
              $sum: "$occupiedNights",
            },
          },
        },

        {
          $lookup: {
            from: "accommodations",

            localField: "_id",

            foreignField: "_id",

            as: "accommodation",
          },
        },

        {
          $unwind: "$accommodation",
        },

        {
          $addFields: {
            occupancy: {
              $min: [
                100,

                {
                  $multiply: [
                    {
                      $divide: [
                        "$occupiedNights",
                        periodDays,
                      ],
                    },

                    100,
                  ],
                },
              ],
            },
          },
        },

        {
          $project: {
            _id: 1,

            name: "$accommodation.name",

            location:
              "$accommodation.location",

            bookings: 1,

            revenue: 1,

            occupancy: {
              $round: [
                "$occupancy",
                0,
              ],
            },
          },
        },

        {
          $sort: {
            bookings: -1,

            revenue: -1,
          },
        },

        {
          $limit: 20,
        },
      ]);

    // ======================================================
    // RESPONSE
    // ======================================================

    res.status(200).json({
      success: true,

      report: {
        range,

        label:
          range === 7
            ? "Last 7 days"
            : range === 30
            ? "Last 30 days"
            : range === 90
            ? "Last 90 days"
            : "Last 12 months",

        revenue,

        bookings: currentBookings,

        users: newUsers,

        accommodations:
          activeAccommodations,

        completedBookings,

        cancelledBookings,

        safetyNotifications:
          safetyCount,

        previousRevenue,

        previousBookings,

        bookingTrend:
          formattedBookingTrend,

        accommodationPerformance,
      },
    });
  } catch (error) {
    console.error(
      "Get admin reports error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve admin reports",
    });
  }
};

// ==========================================================
// USERS
// ==========================================================

export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: users.length,

      users,
    });
  } catch (error) {
    console.error(
      "Get users error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve users",
    });
  }
};

export const getUser = async (req, res) => {
  try {
    const user =
      await User.findById(
        req.params.id
      ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,

      user,
    });
  } catch (error) {
    console.error(
      "Get user error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve user",
    });
  }
};

export const updateUserStatus = async (
  req,
  res
) => {
  try {
    const { isActive } = req.body;

    if (
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "isActive must be a boolean",
      });
    }

    const user =
      await User.findById(
        req.params.id
      );

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    if (
      user._id.toString() ===
      req.user.id.toString()
    ) {
      return res.status(400).json({
        success: false,

        message:
          "You cannot deactivate your own account",
      });
    }

    user.isActive = isActive;

    await user.save();

    res.status(200).json({
      success: true,

      message: isActive
        ? "User account activated successfully"
        : "User account deactivated successfully",

      user: {
        id: user._id,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email: user.email,

        role: user.role,

        isActive:
          user.isActive,
      },
    });
  } catch (error) {
    console.error(
      "Update user status error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to update user status",
    });
  }
};

// ==========================================================
// ACCOMMODATIONS
// ==========================================================

export const getAllAccommodations = async (
  req,
  res
) => {
  try {
    const accommodations =
      await Accommodation.find()
        .populate(
          "owner",
          "firstName lastName email phone profileImage"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,

      count:
        accommodations.length,

      accommodations,
    });
  } catch (error) {
    console.error(
      "Get all accommodations error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve accommodations",
    });
  }
};

export const deleteAccommodation = async (
  req,
  res
) => {
  try {
    const accommodation =
      await Accommodation.findById(
        req.params.id
      );

    if (!accommodation) {
      return res.status(404).json({
        success: false,

        message:
          "Accommodation not found",
      });
    }

    await accommodation.deleteOne();

    res.status(200).json({
      success: true,

      message:
        "Accommodation deleted successfully",
    });
  } catch (error) {
    console.error(
      "Admin delete accommodation error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to delete accommodation",
    });
  }
};

// ==========================================================
// BOOKINGS
// ==========================================================

export const getAllBookings = async (
  req,
  res
) => {
  try {
    const bookings =
      await Booking.find()
        .populate(
          "guest",
          "firstName lastName email phone"
        )
        .populate(
          "accommodation",
          "name location pricePerNight"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,

      count: bookings.length,

      bookings,
    });
  } catch (error) {
    console.error(
      "Get all bookings error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve bookings",
    });
  }
};

export const updateBookingStatus = async (
  req,
  res
) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "completed",
      "cancelled",
    ];

    if (
      !allowedStatuses.includes(status)
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
        "name owner"
      );

    if (!booking) {
      return res.status(404).json({
        success: false,

        message: "Booking not found",
      });
    }

    // ------------------------------------------------------
    // CHECK-IN / CHECK-OUT ARE TRAVELLER ACTIONS
    // ------------------------------------------------------

    if (
      booking.bookingStatus ===
        "checked-in" ||
      booking.bookingStatus ===
        "checked-out"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "This booking status cannot be changed manually by an admin",
      });
    }

    // ------------------------------------------------------
    // UPDATE STATUS
    // ------------------------------------------------------

    booking.bookingStatus = status;

    await booking.save();

    // ------------------------------------------------------
    // NOTIFY TRAVELLER
    // ------------------------------------------------------

    await Notification.create({
      recipient: booking.guest,

      type: "booking",

      title:
        "Booking Status Updated",

      message: `Your booking for "${booking.accommodation.name}" is now ${status}.`,

      booking: booking._id,

      accommodation:
        booking.accommodation._id,

      priority:
        status === "cancelled"
          ? "high"
          : "normal",
    });

    res.status(200).json({
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

    res.status(500).json({
      success: false,

      message:
        "Unable to update booking status",
    });
  }
};

// ==========================================================
// PAYMENTS
// ==========================================================

export const getAllPayments = async (
  req,
  res
) => {
  try {
    const payments =
      await Payment.find()
        .populate(
          "user",
          "firstName lastName email"
        )
        .populate(
          "booking",
          "bookingReference checkInDate checkOutDate totalAmount"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,

      count: payments.length,

      payments,
    });
  } catch (error) {
    console.error(
      "Get all payments error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve payments",
    });
  }
};

// ==========================================================
// CONTACT MESSAGES
// ==========================================================

export const getContactMessages = async (
  req,
  res
) => {
  try {
    const messages =
      await ContactMessage.find()
        .populate(
          "assignedTo",
          "firstName lastName email"
        )
        .populate(
          "respondedBy",
          "firstName lastName email"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,

      count: messages.length,

      messages,
    });
  } catch (error) {
    console.error(
      "Get contact messages error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve contact messages",
    });
  }
};

export const getContactMessage = async (
  req,
  res
) => {
  try {
    const message =
      await ContactMessage.findById(
        req.params.id
      )
        .populate(
          "assignedTo",
          "firstName lastName email"
        )
        .populate(
          "respondedBy",
          "firstName lastName email"
        );

    if (!message) {
      return res.status(404).json({
        success: false,

        message:
          "Contact message not found",
      });
    }

    res.status(200).json({
      success: true,

      contactMessage: message,
    });
  } catch (error) {
    console.error(
      "Get contact message error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve contact message",
    });
  }
};

export const updateContactMessage = async (
  req,
  res
) => {
  try {
    const {
      status,
      priority,
      response,
      assignedTo,
    } = req.body;

    const message =
      await ContactMessage.findById(
        req.params.id
      );

    if (!message) {
      return res.status(404).json({
        success: false,

        message:
          "Contact message not found",
      });
    }

    // ------------------------------------------------------
    // STATUS
    // ------------------------------------------------------

    if (status !== undefined) {
      const allowedStatuses = [
        "unread",
        "in-progress",
        "resolved",
      ];

      if (
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid contact message status",
        });
      }

      message.status = status;

      if (status === "resolved") {
        message.resolvedAt =
          new Date();
      } else {
        message.resolvedAt = null;
      }
    }

    // ------------------------------------------------------
    // PRIORITY
    // ------------------------------------------------------

    if (priority !== undefined) {
      const allowedPriorities = [
        "low",
        "normal",
        "high",
        "urgent",
      ];

      if (
        !allowedPriorities.includes(
          priority
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid priority",
        });
      }

      message.priority = priority;
    }

    // ------------------------------------------------------
    // ASSIGNMENT
    // ------------------------------------------------------

    if (assignedTo !== undefined) {
      message.assignedTo =
        assignedTo || null;
    }

    // ------------------------------------------------------
    // RESPONSE
    // ------------------------------------------------------

    if (response !== undefined) {
      message.response =
        response.trim();

      message.respondedAt =
        new Date();

      message.respondedBy =
        req.user.id;
    }

    await message.save();

    const updatedMessage =
      await ContactMessage.findById(
        message._id
      )
        .populate(
          "assignedTo",
          "firstName lastName email"
        )
        .populate(
          "respondedBy",
          "firstName lastName email"
        );

    res.status(200).json({
      success: true,

      message:
        "Contact message updated successfully",

      contactMessage:
        updatedMessage,
    });
  } catch (error) {
    console.error(
      "Update contact message error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to update contact message",
    });
  }
};

export const deleteContactMessage = async (
  req,
  res
) => {
  try {
    const message =
      await ContactMessage.findById(
        req.params.id
      );

    if (!message) {
      return res.status(404).json({
        success: false,

        message:
          "Contact message not found",
      });
    }

    await message.deleteOne();

    res.status(200).json({
      success: true,

      message:
        "Contact message deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete contact message error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to delete contact message",
    });
  }
};

// ==========================================================
// ADMIN NOTIFICATIONS
// ==========================================================

export const getAdminNotifications = async (
  req,
  res
) => {
  try {
    // ------------------------------------------------------
    // FIND ADMIN USERS
    // ------------------------------------------------------

    const adminUsers =
      await User.find({
        role: "admin",
      }).select("_id");

    const adminIds =
      adminUsers.map(
        (admin) => admin._id
      );

    // ------------------------------------------------------
    // FIND ADMIN NOTIFICATIONS
    // ------------------------------------------------------

    const notifications =
      adminIds.length > 0
        ? await Notification.find({
            recipient: {
              $in: adminIds,
            },
          })
            .populate(
              "recipient",
              "firstName lastName email"
            )
            .populate(
              "booking",
              "bookingReference bookingStatus"
            )
            .populate(
              "accommodation",
              "name"
            )
            .sort({
              createdAt: -1,
            })
        : [];

    const unreadCount =
      notifications.filter(
        (notification) =>
          !notification.isRead
      ).length;

    res.status(200).json({
      success: true,

      count: notifications.length,

      unreadCount,

      notifications,
    });
  } catch (error) {
    console.error(
      "Get admin notifications error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Unable to retrieve notifications",
    });
  }
};

// ==========================================================
// MARK ONE ADMIN NOTIFICATION AS READ
// ==========================================================

export const markAdminNotificationAsRead =
  async (req, res) => {
    try {
      const notification =
        await Notification.findById(
          req.params.id
        );

      if (!notification) {
        return res.status(404).json({
          success: false,

          message:
            "Notification not found",
        });
      }

      notification.isRead = true;

      notification.readAt =
        new Date();

      await notification.save();

      res.status(200).json({
        success: true,

        message:
          "Notification marked as read",

        notification,
      });
    } catch (error) {
      console.error(
        "Mark admin notification as read error:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to mark notification as read",
      });
    }
  };

// ==========================================================
// MARK ALL ADMIN NOTIFICATIONS AS READ
// ==========================================================

export const markAllAdminNotificationsAsRead =
  async (req, res) => {
    try {
      const adminUsers =
        await User.find({
          role: "admin",
        }).select("_id");

      const adminIds =
        adminUsers.map(
          (admin) => admin._id
        );

      if (adminIds.length > 0) {
        await Notification.updateMany(
          {
            recipient: {
              $in: adminIds,
            },

            isRead: false,
          },

          {
            $set: {
              isRead: true,

              readAt: new Date(),
            },
          }
        );
      }

      res.status(200).json({
        success: true,

        message:
          "All notifications marked as read",
      });
    } catch (error) {
      console.error(
        "Mark all admin notifications as read error:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to mark notifications as read",
      });
    }
  };

// ==========================================================
// DELETE ADMIN NOTIFICATION
// ==========================================================

export const deleteAdminNotification =
  async (req, res) => {
    try {
      const notification =
        await Notification.findById(
          req.params.id
        );

      if (!notification) {
        return res.status(404).json({
          success: false,

          message:
            "Notification not found",
        });
      }

      await notification.deleteOne();

      res.status(200).json({
        success: true,

        message:
          "Notification deleted successfully",
      });
    } catch (error) {
      console.error(
        "Delete admin notification error:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to delete notification",
      });
    }
  };

  // ==========================================================
// ADMIN SEND EMAIL
// ==========================================================

export const sendAdminEmail = async (req, res) => {
  try {
    const { audience, subject, message } = req.body;

    // ------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------

    if (!audience || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Audience, subject and message are required",
      });
    }

    const allowedAudiences = [
      "owners",
      "travellers",
      "everyone",
    ];

    if (!allowedAudiences.includes(audience)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email audience",
      });
    }

    // ------------------------------------------------------
    // FIND RECIPIENTS
    // ------------------------------------------------------

    let roleFilter;

    if (audience === "owners") {
      roleFilter = "owner";
    } else if (audience === "travellers") {
      roleFilter = "user";
    } else {
      roleFilter = {
        $in: ["user", "owner"],
      };
    }

    const users = await User.find({
      role: roleFilter,
      isActive: true,
    }).select("firstName email");

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active users found for this audience",
      });
    }

    // ------------------------------------------------------
    // SEND EMAILS
    // ------------------------------------------------------

    let sentCount = 0;
    let failedCount = 0;

    for (const user of users) {
      try {
        await sendEmail({
          to: user.email,
          subject: subject.trim(),
          html: `
            <div style="
              font-family: Arial, Helvetica, sans-serif;
              background-color: #f6f8f7;
              padding: 40px 20px;
              color: #172322;
            ">

              <div style="
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                border: 1px solid #e4e8e6;
              ">

                <div style="
                  background: #173C37;
                  padding: 30px;
                  text-align: center;
                ">
                  <h1 style="
                    margin: 0;
                    color: #ffffff;
                    font-size: 28px;
                  ">
                    TripGuard
                  </h1>

                  <p style="
                    margin: 8px 0 0;
                    color: #63E6BE;
                    font-size: 14px;
                  ">
                    Travel with confidence
                  </p>
                </div>

                <div style="padding: 35px 30px;">

                  <p style="font-size: 16px;">
                    Hello ${user.firstName},
                  </p>

                  <div style="
                    color: #53635e;
                    line-height: 1.8;
                    font-size: 15px;
                  ">
                    ${message.replace(/\n/g, "<br />")}
                  </div>

                  <p style="
                    margin-top: 30px;
                    color: #53635e;
                    line-height: 1.6;
                  ">
                    Stay safe,<br />
                    <strong>The TripGuard Team</strong>
                  </p>

                </div>

                <div style="
                  background: #f6f8f7;
                  padding: 20px 30px;
                  text-align: center;
                ">
                  <p style="
                    margin: 0;
                    color: #8a9591;
                    font-size: 12px;
                  ">
                    © ${new Date().getFullYear()} TripGuard.
                    All rights reserved.
                  </p>
                </div>

              </div>

            </div>
          `,
        });

        sentCount++;
      } catch (emailError) {
        console.error(
          `Failed to send email to ${user.email}:`,
          emailError
        );

        failedCount++;
      }
    }

    // ------------------------------------------------------
    // RESPONSE
    // ------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Email campaign completed",
      sentCount,
      failedCount,
      totalRecipients: users.length,
    });
  } catch (error) {
    console.error("Send admin email error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send emails",
    });
  }
};