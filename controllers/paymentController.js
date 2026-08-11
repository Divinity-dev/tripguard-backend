import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";

export const initializePayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      guest: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.bookingStatus === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be paid for",
      });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "This booking has already been paid for",
      });
    }

    const reference = `TG-PAY-${Date.now()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const payment = await Payment.create({
      booking: booking._id,
      user: req.user.id,
      amount: booking.totalAmount,
      currency: "NGN",
      reference,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Payment initialized",
      payment: {
        id: payment._id,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
      },
    });
  } catch (error) {
    console.error("Initialize payment error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
    });
  }
};

export const getPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).populate("booking");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve payment",
    });
  }
};

export const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({
      user: req.user.id,
    })
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
    console.error("Get my payments error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve payments",
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const payment = await Payment.findOne({
      reference,
      user: req.user.id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    /*
      Paystack verification will be implemented here.

      After Paystack confirms the transaction, we will:
      1. Update payment.status
      2. Store paystackReference
      3. Store payment channel
      4. Store gateway response
      5. Set paidAt
      6. Update Booking.paymentStatus
      7. Update Booking.paymentReference
      8. Confirm the booking
      9. Create a notification
    */

    res.status(200).json({
      success: true,
      message: "Payment verification endpoint is ready",
      payment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });
  }
};

export const getPaymentByReference = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      reference: req.params.reference,
      user: req.user.id,
    }).populate("booking");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment by reference error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve payment",
    });
  }
}