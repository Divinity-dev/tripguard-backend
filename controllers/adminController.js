import User from "../models/User.js";
import Accommodation from "../models/Accommodation.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import ContactMessage from "../models/ContactMessage.js";
import Notification from "../models/Notification.js";

export const getDashboardStats = async (req, res) => {
  try {
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
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "owner" }),
      User.countDocuments({ role: "admin" }),

      Accommodation.countDocuments(),

      Accommodation.countDocuments({
        status: "pending",
      }),

      Booking.countDocuments(),

      Booking.countDocuments({
        bookingStatus: "pending",
      }),

      Payment.countDocuments({
        status: "successful",
      }),

      ContactMessage.countDocuments(),

      ContactMessage.countDocuments({
        status: "unread",
      }),
    ]);

    const revenueResult = await Payment.aggregate([
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
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve dashboard statistics",
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve users",
    });
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password");

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
    console.error("Get user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve user",
    });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user._id.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account",
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
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Update user status error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update user status",
    });
  }
};

export const getAllAccommodations = async (req, res) => {
  try {
    const accommodations = await Accommodation.find()
      .populate(
        "owner",
        "firstName lastName email phone profileImage"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: accommodations.length,
      accommodations,
    });
  } catch (error) {
    console.error("Get all accommodations error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve accommodations",
    });
  }
};

export const getPendingAccommodations = async (req, res) => {
  try {
    const accommodations = await Accommodation.find({
      status: "pending",
    })
      .populate(
        "owner",
        "firstName lastName email phone profileImage"
      )
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: accommodations.length,
      accommodations,
    });
  } catch (error) {
    console.error("Get pending accommodations error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve pending accommodations",
    });
  }
};

export const updateAccommodationStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    const allowedStatuses = [
      "pending",
      "approved",
      "rejected",
      "suspended",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid accommodation status",
      });
    }

    const accommodation = await Accommodation.findById(
      req.params.id
    );

    if (!accommodation) {
      return res.status(404).json({
        success: false,
        message: "Accommodation not found",
      });
    }

    accommodation.status = status;

    if (status === "rejected") {
      accommodation.rejectionReason =
        rejectionReason?.trim() || "";
    } else {
      accommodation.rejectionReason = "";
    }

    await accommodation.save();

    let notificationTitle = "";
    let notificationMessage = "";
    let priority = "normal";

    if (status === "approved") {
      notificationTitle = "Accommodation Approved";
      notificationMessage = `Your accommodation "${accommodation.name}" has been approved and is now visible to travellers.`;
    }

    if (status === "rejected") {
      notificationTitle = "Accommodation Rejected";
      notificationMessage = `Your accommodation "${accommodation.name}" was rejected. ${
        rejectionReason
          ? `Reason: ${rejectionReason}`
          : "Please review your listing and make the necessary changes."
      }`;
      priority = "high";
    }

    if (status === "suspended") {
      notificationTitle = "Accommodation Suspended";
      notificationMessage = `Your accommodation "${accommodation.name}" has been suspended.`;
      priority = "high";
    }

    if (notificationTitle) {
      await Notification.create({
        recipient: accommodation.owner,
        type: "accommodation",
        title: notificationTitle,
        message: notificationMessage,
        accommodation: accommodation._id,
        priority,
      });
    }

    res.status(200).json({
      success: true,
      message: "Accommodation status updated successfully",
      accommodation,
    });
  } catch (error) {
    console.error("Update accommodation status error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update accommodation status",
    });
  }
};

export const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate(
        "guest",
        "firstName lastName email phone"
      )
      .populate(
        "accommodation",
        "name location pricePerNight"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Get all bookings error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve bookings",
    });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
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

    const booking = await Booking.findById(
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

    booking.bookingStatus = status;

    await booking.save();

    await Notification.create({
      recipient: booking.guest,
      type: "booking",
      title: "Booking Status Updated",
      message: `Your booking for "${booking.accommodation.name}" is now ${status}.`,
      booking: booking._id,
      accommodation: booking.accommodation._id,
      priority: "normal",
    });

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
};

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate(
        "user",
        "firstName lastName email"
      )
      .populate(
        "booking",
        "bookingReference checkInDate checkOutDate totalAmount"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get all payments error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve payments",
    });
  }
};

export const getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find()
      .populate(
        "assignedTo",
        "firstName lastName email"
      )
      .populate(
        "respondedBy",
        "firstName lastName email"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error("Get contact messages error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve contact messages",
    });
  }
};

export const updateContactMessage = async (req, res) => {
  try {
    const {
      status,
      priority,
      response,
      assignedTo,
    } = req.body;

    const message = await ContactMessage.findById(
      req.params.id
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Contact message not found",
      });
    }

    if (status !== undefined) {
      const allowedStatuses = [
        "unread",
        "in-progress",
        "resolved",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid contact message status",
        });
      }

      message.status = status;

      if (status === "resolved") {
        message.resolvedAt = new Date();
      }
    }

    if (priority !== undefined) {
      const allowedPriorities = [
        "low",
        "normal",
        "high",
        "urgent",
      ];

      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "Invalid priority",
        });
      }

      message.priority = priority;
    }

    if (assignedTo !== undefined) {
      message.assignedTo = assignedTo;
    }

    if (response !== undefined) {
      message.response = response.trim();
      message.respondedAt = new Date();
      message.respondedBy = req.user.id;
    }

    await message.save();

    const updatedMessage =
      await ContactMessage.findById(message._id)
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
      message: "Contact message updated successfully",
      contactMessage: updatedMessage,
    });
  } catch (error) {
    console.error("Update contact message error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update contact message",
    });
  }
};

export const deleteContactMessage = async (req, res) => {
  try {
    const message = await ContactMessage.findById(
      req.params.id
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Contact message not found",
      });
    }

    await message.deleteOne();

    res.status(200).json({
      success: true,
      message: "Contact message deleted successfully",
    });
  } catch (error) {
    console.error("Delete contact message error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete contact message",
    });
  }
}