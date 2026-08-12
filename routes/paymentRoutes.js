import crypto from "crypto";

import Payment from "../models/payments.js";
import Booking from "../models/bookings.js";
import Notification from "../models/notifications.js";
import User from "../models/users.js";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const TRIPGUARD_COMMISSION_RATE = 10;

/*
 * Paystack request headers
 */
const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

/*
 * Generate a unique TripGuard payment reference
 */
const generateReference = () => {
  return `TG-PAY-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
};

/*
 * Calculate the payment split.

 * Example:
 *
 * Booking amount = ₦100,000
 *
 * TripGuard = ₦10,000
 * Owner     = ₦90,000
 */
const calculatePaymentSplit = (amount) => {
  const commissionAmount =
    Math.round(
      amount * (TRIPGUARD_COMMISSION_RATE / 100) * 100
    ) / 100;

  const ownerAmount =
    Math.round(
      (amount - commissionAmount) * 100
    ) / 100;

  return {
    commissionRate: TRIPGUARD_COMMISSION_RATE,
    commissionAmount,
    ownerAmount,
  };
};

/*
 * Mark payment as successful
 *
 * This function:
 *
 * 1. Updates the payment
 * 2. Updates the booking
 * 3. Notifies the traveller
 * 4. Notifies the property owner
 */
const markPaymentSuccessful = async (
  payment,
  paystackData
) => {
  /*
   * Prevent duplicate processing.
   */
  if (payment.status === "successful") {
    return payment;
  }

  payment.status = "successful";

  payment.paystackReference =
    paystackData.reference || payment.reference;

  payment.paystackTransactionId =
    paystackData.id?.toString() || "";

  payment.channel =
    paystackData.channel || "";

  payment.paidAt = paystackData.paid_at
    ? new Date(paystackData.paid_at)
    : new Date();

  payment.gatewayResponse =
    paystackData.gateway_response || null;

  payment.metadata = {
    ...(payment.metadata || {}),
    authorization:
      paystackData.authorization || null,
    customer:
      paystackData.customer || null,
  };

  await payment.save();

  /*
   * Update booking
   */
  const booking = await Booking.findById(
    payment.booking
  );

  if (booking) {
    booking.paymentStatus = "paid";
    booking.paymentReference =
      payment.reference;
    booking.paymentDate =
      payment.paidAt;

    if (
      booking.bookingStatus !==
      "cancelled"
    ) {
      booking.bookingStatus = "confirmed";
    }

    await booking.save();
  }

  /*
   * Notify traveller
   */
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
      "Traveller notification error:",
      notificationError
    );
  }

  /*
   * Notify property owner
   */
  try {
    if (payment.owner) {
      await Notification.create({
        user: payment.owner,
        title: "New booking payment",
        message: `A traveller has successfully paid for booking ${payment.reference}.`,
        type: "payment",
        read: false,
      });
    }
  } catch (notificationError) {
    console.error(
      "Owner notification error:",
      notificationError
    );
  }

  return payment;
};

/*
|--------------------------------------------------------------------------
| INITIALIZE PAYMENT
|--------------------------------------------------------------------------
|
| Traveller pays the complete booking amount.
|
| Example:
|
| Booking = ₦100,000
|
| TripGuard commission = ₦10,000
| Property owner      = ₦90,000
|
| Paystack handles the split through
| the owner's Paystack subaccount.
|
*/
export const initializePayment = async (
  req,
  res
) => {
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
        message:
          "Paystack is not configured",
      });
    }

    /*
     * Find the booking belonging to
     * the authenticated traveller.
     */
    const booking =
      await Booking.findOne({
        _id: bookingId,
        guest: req.user.id,
      })
        .populate(
          "guest",
          "firstName lastName email"
        )
        .populate(
          "accommodation",
          "owner name status isAvailable"
        );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    /*
     * Make sure accommodation exists.
     */
    if (!booking.accommodation) {
      return res.status(400).json({
        success: false,
        message:
          "The accommodation associated with this booking could not be found",
      });
    }

    /*
     * Only approved properties can
     * accept payments.
     */
    if (
      booking.accommodation.status !==
      "approved"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This accommodation is not currently approved for bookings",
      });
    }

    /*
     * Make sure property is available.
     */
    if (
      booking.accommodation.isAvailable ===
      false
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This accommodation is currently unavailable",
      });
    }

    /*
     * Make sure property owner exists.
     */
    if (!booking.accommodation.owner) {
      return res.status(400).json({
        success: false,
        message:
          "This accommodation does not have a property owner",
      });
    }

    /*
     * Find property owner.
     */
    const propertyOwner =
      await User.findById(
        booking.accommodation.owner
      ).select(
        "firstName lastName email role paystackSubaccountCode paymentSetupCompleted paymentSetupStatus"
      );

    if (!propertyOwner) {
      return res.status(400).json({
        success: false,
        message:
          "Property owner not found",
      });
    }

    /*
     * Confirm owner account.
     */
    if (propertyOwner.role !== "owner") {
      return res.status(400).json({
        success: false,
        message:
          "The accommodation owner account is invalid",
      });
    }

    /*
     * Owner must have completed
     * Paystack onboarding.
     */
    if (
      !propertyOwner.paymentSetupCompleted ||
      !propertyOwner.paystackSubaccountCode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This property is not currently ready to accept payments",
      });
    }

    /*
     * Cancelled bookings cannot be paid.
     */
    if (
      booking.bookingStatus ===
      "cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Cancelled bookings cannot be paid for",
      });
    }

    /*
     * Prevent payment for an already
     * paid booking.
     */
    if (
      booking.paymentStatus === "paid"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking has already been paid for",
      });
    }

    /*
     * Validate booking amount.
     */
    if (
      !booking.totalAmount ||
      booking.totalAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid booking amount",
      });
    }

    /*
     * Prevent duplicate successful
     * payment records.
     */
    const existingPayment =
      await Payment.findOne({
        booking: booking._id,
        user: req.user.id,
        status: "successful",
      });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message:
          "This booking has already been paid for",
      });
    }

    /*
     * Calculate commission.
     */
    const {
      commissionRate,
      commissionAmount,
      ownerAmount,
    } = calculatePaymentSplit(
      booking.totalAmount
    );

    /*
     * Customer email.
     */
    const customerEmail =
      booking.guest?.email ||
      req.user.email;

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message:
          "A valid customer email is required for payment",
      });
    }

    /*
     * Generate local reference.
     */
    const reference =
      generateReference();

    /*
     * Create local payment record
     * BEFORE contacting Paystack.
     */
    const payment =
      await Payment.create({
        booking: booking._id,

        user: req.user.id,

        owner:
          propertyOwner._id,

        property:
          booking.accommodation._id,

        amount:
          booking.totalAmount,

        currency: "NGN",

        commissionRate,

        commissionAmount,

        ownerAmount,

        paystackSubaccount:
          propertyOwner.paystackSubaccountCode,

        reference,

        status: "pending",

        metadata: {
          bookingId:
            booking._id.toString(),

          accommodationId:
            booking.accommodation._id.toString(),

          ownerId:
            propertyOwner._id.toString(),

          commissionRate,

          commissionAmount,

          ownerAmount,
        },
      });

    /*
     * Paystack uses kobo.
     */
    const amountInKobo =
      Math.round(
        booking.totalAmount * 100
      );

    const transactionChargeInKobo =
      Math.round(
        commissionAmount * 100
      );

    /*
     * Initialize Paystack transaction.
     */
    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          method: "POST",

          headers:
            getPaystackHeaders(),

          body: JSON.stringify({
            email: customerEmail,

            amount:
              amountInKobo,

            currency: "NGN",

            reference,

            callback_url:
              `${process.env.CLIENT_URL}/payment/callback`,

            /*
             * Owner's Paystack subaccount.
             */
            subaccount:
              propertyOwner.paystackSubaccountCode,

            /*
             * TripGuard's commission.
             */
            transaction_charge:
              transactionChargeInKobo,

            /*
             * The subaccount bears
             * the Paystack transaction fee.
             */
            bearer: "subaccount",

            metadata: {
              bookingId:
                booking._id.toString(),

              paymentId:
                payment._id.toString(),

              userId:
                req.user.id.toString(),

              ownerId:
                propertyOwner._id.toString(),

              accommodationId:
                booking.accommodation._id.toString(),

              commissionRate,

              commissionAmount,

              ownerAmount,
            },
          }),
        }
      );

    const paystackData =
      await paystackResponse.json();

    /*
     * Paystack rejected initialization.
     */
    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      await Payment.findByIdAndDelete(
        payment._id
      );

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

    /*
     * Store Paystack information.
     */
    payment.paystackReference =
      paystackData.data.reference;

    payment.metadata = {
      ...(payment.metadata || {}),

      accessCode:
        paystackData.data.access_code,

      authorizationUrl:
        paystackData.data
          .authorization_url,
    };

    await payment.save();

    return res.status(201).json({
      success: true,

      message:
        "Payment initialized successfully",

      payment: {
        id: payment._id,

        reference:
          payment.reference,

        paystackReference:
          payment.paystackReference,

        amount:
          payment.amount,

        currency:
          payment.currency,

        commissionRate:
          payment.commissionRate,

        commissionAmount:
          payment.commissionAmount,

        ownerAmount:
          payment.ownerAmount,

        authorizationUrl:
          paystackData.data
            .authorization_url,

        accessCode:
          paystackData.data
            .access_code,
      },
    });
  } catch (error) {
    console.error(
      "Initialize payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to initialize payment",
    });
  }
};

/*
|--------------------------------------------------------------------------
| VERIFY PAYMENT
|--------------------------------------------------------------------------
*/
export const verifyPayment = async (
  req,
  res
) => {
  try {
    const { reference } =
      req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message:
          "Payment reference is required",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "Paystack is not configured",
      });
    }

    /*
     * Only the traveller who owns
     * the payment can verify it.
     */
    const payment =
      await Payment.findOne({
        reference,
        user: req.user.id,
      });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    /*
     * Already successful.
     */
    if (
      payment.status ===
      "successful"
    ) {
      return res.status(200).json({
        success: true,
        message:
          "Payment has already been verified",
        payment,
      });
    }

    /*
     * Ask Paystack for actual status.
     */
    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(
          reference
        )}`,
        {
          method: "GET",
          headers:
            getPaystackHeaders(),
        }
      );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to verify payment with Paystack",
      });
    }

    const transaction =
      paystackData.data;

    /*
     * Verify reference.
     */
    if (
      transaction.reference !==
      payment.reference
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment reference mismatch",
      });
    }

    /*
     * Verify amount.
     */
    if (
      Number(transaction.amount) !==
      Math.round(
        payment.amount * 100
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment amount mismatch",
      });
    }

    /*
     * Payment was not successful.
     */
    if (
      transaction.status !==
      "success"
    ) {
      payment.status =
        transaction.status ===
        "failed"
          ? "failed"
          : "pending";

      payment.channel =
        transaction.channel || "";

      payment.gatewayResponse =
        transaction.gateway_response ||
        null;

      await payment.save();

      return res.status(400).json({
        success: false,
        message:
          "Payment was not successful",
        status:
          transaction.status,
        payment,
      });
    }

    /*
     * Mark successful.
     */
    const updatedPayment =
      await markPaymentSuccessful(
        payment,
        transaction
      );

    return res.status(200).json({
      success: true,
      message:
        "Payment verified successfully",
      payment:
        updatedPayment,
    });
  } catch (error) {
    console.error(
      "Verify payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify payment",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE PAYMENT
|--------------------------------------------------------------------------
*/
export const getPayment = async (
  req,
  res
) => {
  try {
    const payment =
      await Payment.findOne({
        _id: req.params.id,
        user: req.user.id,
      })
        .populate("booking")
        .populate(
          "property",
          "name"
        )
        .populate(
          "owner",
          "firstName lastName email"
        );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error(
      "Get payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve payment",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET TRAVELLER PAYMENTS
|--------------------------------------------------------------------------
*/
export const getMyPayments = async (
  req,
  res
) => {
  try {
    const payments =
      await Payment.find({
        user: req.user.id,
      })
        .populate(
          "booking",
          "bookingReference checkInDate checkOutDate totalAmount"
        )
        .populate(
          "property",
          "name"
        )
        .populate(
          "owner",
          "firstName lastName email"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error(
      "Get my payments error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve payments",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET PAYMENT BY REFERENCE
|--------------------------------------------------------------------------
*/
export const getPaymentByReference =
  async (req, res) => {
    try {
      const payment =
        await Payment.findOne({
          reference:
            req.params.reference,
          user: req.user.id,
        })
          .populate("booking")
          .populate(
            "property",
            "name"
          )
          .populate(
            "owner",
            "firstName lastName email"
          );

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found",
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
        message:
          "Unable to retrieve payment",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| PAYSTACK WEBHOOK
|--------------------------------------------------------------------------
*/
export const handlePaystackWebhook =
  async (req, res) => {
    try {
      const signature =
        req.headers[
          "x-paystack-signature"
        ];

      if (!signature) {
        return res
          .status(401)
          .send(
            "Missing signature"
          );
      }

      /*
       * Paystack signs the raw request body.
       */
      const payload =
        Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);

      const hash =
        crypto
          .createHmac(
            "sha512",
            process.env
              .PAYSTACK_SECRET_KEY
          )
          .update(payload)
          .digest("hex");

      if (hash !== signature) {
        return res
          .status(401)
          .send(
            "Invalid signature"
          );
      }

      /*
       * express.raw() gives us a Buffer,
       * so convert it into JSON.
       */
      const event =
        Buffer.isBuffer(req.body)
          ? JSON.parse(
              req.body.toString(
                "utf8"
              )
            )
          : req.body;

      /*
       * We only process successful
       * charge events.
       */
      if (
        event.event !==
        "charge.success"
      ) {
        return res
          .status(200)
          .send(
            "Event received"
          );
      }

      const transaction =
        event.data;

      if (
        !transaction?.reference
      ) {
        return res
          .status(200)
          .send(
            "Event received"
          );
      }

      /*
       * Find local payment.
       */
      const payment =
        await Payment.findOne({
          reference:
            transaction.reference,
        });

      /*
       * Unknown payment.
       *
       * Return 200 so Paystack doesn't
       * continuously retry the webhook.
       */
      if (!payment) {
        return res
          .status(200)
          .send(
            "Payment received"
          );
      }

      /*
       * Prevent duplicate processing.
       */
      if (
        payment.status ===
        "successful"
      ) {
        return res
          .status(200)
          .send(
            "Payment already processed"
          );
      }

      /*
       * Verify transaction status.
       */
      if (
        transaction.status !==
        "success"
      ) {
        return res
          .status(200)
          .send(
            "Payment not fulfilled"
          );
      }

      /*
       * Verify amount.
       */
      if (
        Number(transaction.amount) !==
        Math.round(
          payment.amount * 100
        )
      ) {
        console.error(
          "Webhook amount mismatch:",
          {
            paymentAmount:
              payment.amount,
            transactionAmount:
              transaction.amount,
            reference:
              transaction.reference,
          }
        );

        return res
          .status(200)
          .send(
            "Payment amount mismatch"
          );
      }

      /*
       * Mark payment successful.
       */
      await markPaymentSuccessful(
        payment,
        transaction
      );

      return res
        .status(200)
        .send(
          "Webhook processed"
        );
    } catch (error) {
      console.error(
        "Paystack webhook error:",
        error
      );

      return res
        .status(500)
        .send(
          "Webhook processing failed"
        );
    }
  };