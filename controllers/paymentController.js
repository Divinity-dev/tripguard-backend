import crypto from "crypto";
import Payment from "../models/payments.js";
import Booking from "../models/bookings.js";
import Notification from "../models/notifications.js";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

const generateReference = () => {
  return `TG-PAY-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
};

const markPaymentSuccessful = async (payment, paystackData) => {
  if (payment.status === "success") {
    return payment;
  }

  payment.status = "success";
  payment.paystackReference =
    paystackData.reference || payment.reference;

  payment.paidAt = paystackData.paid_at
    ? new Date(paystackData.paid_at)
    : new Date();

  payment.metadata = {
    ...payment.metadata,
    channel: paystackData.channel,
    gatewayResponse: paystackData.gateway_response,
    paystackTransactionId: paystackData.id,
    authorization: paystackData.authorization,
    customer: paystackData.customer,
  };

  await payment.save();

  const booking = await Booking.findById(payment.booking);

  if (booking) {
    booking.paymentStatus = "paid";
    booking.paymentReference = payment.reference;

    if (booking.bookingStatus !== "cancelled") {
      booking.bookingStatus = "confirmed";
    }

    await booking.save();
  }

  try {
    await Notification.create({
      user: payment.user,
      title: "Payment successful",
      message: `Your payment for booking ${payment.reference} was successful.`,
      type: "payment",
      read: false,
    });
  } catch (notificationError) {
    console.error(
      "Notification creation error:",
      notificationError
    );
  }

  return payment;
};

export const initializePayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack is not configured",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      guest: req.user.id,
    }).populate("guest", "name email");

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

    if (!booking.totalAmount || booking.totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking amount",
      });
    }

    const existingPayment = await Payment.findOne({
      booking: booking._id,
      user: req.user.id,
      status: "success",
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "This booking has already been paid for",
      });
    }

    const reference = generateReference();

    const payment = await Payment.create({
      booking: booking._id,
      user: req.user.id,
      amount: booking.totalAmount,
      currency: "NGN",
      reference,
      status: "pending",
      paymentMethod: "paystack",
      metadata: {
        bookingId: booking._id.toString(),
      },
    });

    const amountInKobo = Math.round(booking.totalAmount * 100);

    const customerEmail =
      booking.guest?.email || req.user.email;

    if (!customerEmail) {
      await Payment.findByIdAndDelete(payment._id);

      return res.status(400).json({
        success: false,
        message: "A valid customer email is required for payment",
      });
    }

    const paystackResponse = await fetch(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        method: "POST",
        headers: getPaystackHeaders(),
        body: JSON.stringify({
          email: customerEmail,
          amount: amountInKobo,
          currency: "NGN",
          reference,
          callback_url: `${process.env.CLIENT_URL}/payment/callback`,
          metadata: {
            bookingId: booking._id.toString(),
            paymentId: payment._id.toString(),
            userId: req.user.id.toString(),
          },
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      await Payment.findByIdAndDelete(payment._id);

      console.error(
        "Paystack initialization failed:",
        paystackData
      );

      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to initialize Paystack payment",
      });
    }

    payment.paystackReference =
      paystackData.data.reference;

    payment.metadata = {
      ...payment.metadata,
      accessCode: paystackData.data.access_code,
    };

    await payment.save();

    return res.status(201).json({
      success: true,
      message: "Payment initialized successfully",
      payment: {
        id: payment._id,
        reference: payment.reference,
        paystackReference: payment.paystackReference,
        amount: payment.amount,
        currency: payment.currency,
        authorizationUrl:
          paystackData.data.authorization_url,
        accessCode: paystackData.data.access_code,
      },
    });
  } catch (error) {
    console.error("Initialize payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack is not configured",
      });
    }

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

    if (payment.status === "success") {
      return res.status(200).json({
        success: true,
        message: "Payment has already been verified",
        payment,
      });
    }

    const paystackResponse = await fetch(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: getPaystackHeaders(),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to verify payment with Paystack",
      });
    }

    const transaction = paystackData.data;

    if (transaction.status !== "success") {
      payment.status =
        transaction.status === "failed"
          ? "failed"
          : "pending";

      payment.metadata = {
        ...payment.metadata,
        channel: transaction.channel,
        gatewayResponse: transaction.gateway_response,
      };

      await payment.save();

      return res.status(400).json({
        success: false,
        message: "Payment was not successful",
        status: transaction.status,
        payment,
      });
    }

    if (
      Number(transaction.amount) !==
      Math.round(payment.amount * 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment amount mismatch",
      });
    }

    const updatedPayment = await markPaymentSuccessful(
      payment,
      transaction
    );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      payment: updatedPayment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
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

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment error:", error);

    return res.status(500).json({
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

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get my payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve payments",
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

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error(
      "Get payment by reference error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve payment",
    });
  }
};

export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(401).send("Missing signature");
    }

    const payload =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

    const hash = crypto
      .createHmac(
        "sha512",
        process.env.PAYSTACK_SECRET_KEY
      )
      .update(payload)
      .digest("hex");

    if (hash !== signature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event.event !== "charge.success") {
      return res.status(200).send("Event received");
    }

    const transaction = event.data;

    if (!transaction?.reference) {
      return res.status(200).send("Event received");
    }

    const payment = await Payment.findOne({
      reference: transaction.reference,
    });

    if (!payment) {
      return res.status(200).send("Payment received");
    }

    if (payment.status === "success") {
      return res.status(200).send("Payment already processed");
    }

    if (
      transaction.status !== "success" ||
      Number(transaction.amount) !==
        Math.round(payment.amount * 100)
    ) {
      return res.status(200).send("Payment not fulfilled");
    }

    await markPaymentSuccessful(
      payment,
      transaction
    );

    return res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Paystack webhook error:", error);

    return res.status(500).send("Webhook processing failed");
  }
};