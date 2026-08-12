import crypto from "crypto";

import Payment from "../models/payments.js";
import Booking from "../models/bookings.js";
import Notification from "../models/notifications.js";
import User from "../models/users.js";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const TRIPGUARD_COMMISSION_RATE = 10;

/*
 * --------------------------------------------------
 * PAYSTACK HELPERS
 * --------------------------------------------------
 */

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

const generateReference = () => {
  return `TG-PAY-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
};

/*
 * --------------------------------------------------
 * CALCULATE TRIPGUARD COMMISSION
 * --------------------------------------------------
 *
 * Example:
 *
 * Booking amount = ₦100,000
 * TripGuard = ₦10,000
 * Owner = ₦90,000
 */

const calculatePaymentSplit = (amount) => {
  const commissionAmount =
    Math.round(
      amount *
        (TRIPGUARD_COMMISSION_RATE / 100) *
        100
    ) / 100;

  const ownerAmount =
    Math.round(
      (amount - commissionAmount) * 100
    ) / 100;

  return {
    commissionRate:
      TRIPGUARD_COMMISSION_RATE,

    commissionAmount,

    ownerAmount,
  };
};

/*
 * --------------------------------------------------
 * MARK PAYMENT SUCCESSFUL
 * --------------------------------------------------
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
    paystackData.reference ||
    payment.reference;

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
   * --------------------------------------------------
   * UPDATE BOOKING
   * --------------------------------------------------
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
      booking.bookingStatus =
        "confirmed";
    }

    await booking.save();
  }

  /*
   * --------------------------------------------------
   * NOTIFY TRAVELLER
   * --------------------------------------------------
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
   * --------------------------------------------------
   * NOTIFY PROPERTY OWNER
   * --------------------------------------------------
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
 * ==================================================
 * OWNER PAYSTACK PAYMENT SETUP
 * ==================================================
 */

/*
 * --------------------------------------------------
 * GET SUPPORTED NIGERIAN BANKS
 * --------------------------------------------------
 *
 * GET /api/payments/banks
 */

export const getPaystackBanks = async (
  req,
  res
) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "Paystack is not configured",
      });
    }

    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/bank?country=nigeria&perPage=100`,
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
      console.error(
        "Paystack bank list error:",
        paystackData
      );

      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to retrieve supported banks",
      });
    }

    const banks = (
      paystackData.data || []
    )
      .filter(
        (bank) => bank.active
      )
      .map((bank) => ({
        id: bank.id,

        name: bank.name,

        code: bank.code,

        longcode:
          bank.longcode,

        slug: bank.slug,
      }))
      .sort((a, b) =>
        a.name.localeCompare(
          b.name
        )
      );

    return res.status(200).json({
      success: true,

      count: banks.length,

      banks,
    });
  } catch (error) {
    console.error(
      "Get Paystack banks error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve supported banks",
    });
  }
};

/*
 * --------------------------------------------------
 * GET OWNER PAYMENT SETUP
 * --------------------------------------------------
 *
 * GET /api/payments/owner/setup
 */

export const getOwnerPaymentSetup = async (
  req,
  res
) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({
        success: false,
        message:
          "Only property owners can access payment setup",
      });
    }

    return res.status(200).json({
      success: true,

      paymentSetup: {
        completed:
          req.user
            .paymentSetupCompleted,

        status:
          req.user
            .paymentSetupStatus,

        bank:
          req.user
            .paystackSettlementBank ||
          "",

        accountNumber:
          req.user
            .paystackSettlementAccount ||
          "",

        accountName:
          req.user
            .paystackSettlementAccountName ||
          "",

        subaccountCode:
          req.user
            .paystackSubaccountCode ||
          "",
      },
    });
  } catch (error) {
    console.error(
      "Get owner payment setup error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve payment setup",
    });
  }
};

/*
 * --------------------------------------------------
 * SET UP OWNER PAYSTACK ACCOUNT
 * --------------------------------------------------
 *
 * POST /api/payments/owner/setup
 *
 * Owner sends:
 *
 * {
 *   bankCode: "058",
 *   accountNumber: "0123456789"
 * }
 *
 * Flow:
 *
 * 1. Validate owner.
 * 2. Validate account number.
 * 3. Resolve account with Paystack.
 * 4. Create Paystack subaccount.
 * 5. Save subaccount against owner.
 */

export const setupOwnerPayment = async (
  req,
  res
) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "Paystack is not configured",
      });
    }

    /*
     * Only property owners can
     * connect payment accounts.
     */
    if (req.user.role !== "owner") {
      return res.status(403).json({
        success: false,
        message:
          "Only property owners can set up payment accounts",
      });
    }

    const {
      bankCode,
      accountNumber,
    } = req.body;

    if (
      !bankCode ||
      !accountNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Bank and account number are required",
      });
    }

    /*
     * Normalize account number.
     */
    const normalizedAccountNumber =
      String(accountNumber).replace(
        /\D/g,
        ""
      );

    if (
      normalizedAccountNumber.length !==
      10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid 10-digit bank account number",
      });
    }

    const normalizedBankCode =
      String(bankCode).trim();

    /*
     * --------------------------------------------------
     * RESOLVE BANK ACCOUNT
     * --------------------------------------------------
     *
     * This confirms the account exists
     * and gives us the account holder name.
     */

    const resolveResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(
          normalizedAccountNumber
        )}&bank_code=${encodeURIComponent(
          normalizedBankCode
        )}`,
        {
          method: "GET",

          headers:
            getPaystackHeaders(),
        }
      );

    const resolveData =
      await resolveResponse.json();

    if (
      !resolveResponse.ok ||
      !resolveData.status ||
      !resolveData.data
    ) {
      req.user.paymentSetupStatus =
        "failed";

      await req.user.save();

      return res.status(400).json({
        success: false,
        message:
          resolveData.message ||
          "Unable to verify this bank account. Please check the bank and account number.",
      });
    }

    const accountName =
      resolveData.data.account_name;

    /*
     * --------------------------------------------------
     * EXISTING SUBACCOUNT
     * --------------------------------------------------
     *
     * If the owner already has a Paystack
     * subaccount, update it instead of
     * creating another one.
     */

    if (
      req.user.paystackSubaccountCode
    ) {
      const updateResponse =
        await fetch(
          `${PAYSTACK_BASE_URL}/subaccount/${encodeURIComponent(
            req.user.paystackSubaccountCode
          )}`,
          {
            method: "PUT",

            headers:
              getPaystackHeaders(),

            body: JSON.stringify({
              business_name:
                `${req.user.firstName} ${req.user.lastName}`,

              description:
                `TripGuard property owner account for ${req.user.firstName} ${req.user.lastName}`,

              bank_code:
                normalizedBankCode,

              account_number:
                normalizedAccountNumber,

              percentage_charge: 0,

              primary_contact_email:
                req.user.email,

              primary_contact_name:
                `${req.user.firstName} ${req.user.lastName}`,

              primary_contact_phone:
                req.user.phone || "",

              active: true,

              metadata:
                JSON.stringify({
                  ownerId:
                    req.user._id.toString(),

                  platform:
                    "TripGuard",
                }),
            }),
          }
        );

      const updateData =
        await updateResponse.json();

      if (
        !updateResponse.ok ||
        !updateData.status ||
        !updateData.data
      ) {
        req.user.paymentSetupStatus =
          "failed";

        await req.user.save();

        console.error(
          "Paystack subaccount update failed:",
          updateData
        );

        return res.status(502).json({
          success: false,
          message:
            updateData.message ||
            "Unable to update your Paystack payment account",
        });
      }

      const updatedSubaccount =
        updateData.data;

      req.user.paystackSettlementBank =
        updatedSubaccount
          .settlement_bank ||
        "";

      req.user.paystackSettlementAccount =
        updatedSubaccount
          .account_number ||
        normalizedAccountNumber;

      req.user.paystackSettlementAccountName =
        updatedSubaccount
          .account_name ||
        accountName ||
        "";

      req.user.paymentSetupCompleted =
        true;

      req.user.paymentSetupStatus =
        "completed";

      await req.user.save();

      return res.status(200).json({
        success: true,

        message:
          "Payment account updated successfully",

        paymentSetup: {
          completed: true,

          status: "completed",

          subaccountCode:
            req.user
              .paystackSubaccountCode,

          bank:
            req.user
              .paystackSettlementBank,

          accountNumber:
            req.user
              .paystackSettlementAccount,

          accountName:
            req.user
              .paystackSettlementAccountName,
        },
      });
    }

    /*
     * --------------------------------------------------
     * CREATE NEW SUBACCOUNT
     * --------------------------------------------------
     */

    req.user.paymentSetupStatus =
      "pending";

    await req.user.save();

    const subaccountResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/subaccount`,
        {
          method: "POST",

          headers:
            getPaystackHeaders(),

          body: JSON.stringify({
            business_name:
              `${req.user.firstName} ${req.user.lastName}`,

            settlement_bank:
              normalizedBankCode,

            account_number:
              normalizedAccountNumber,

            /*
             * We don't use Paystack's
             * percentage split.
             *
             * TripGuard's 10% commission
             * is calculated per booking
             * through transaction_charge.
             */
            percentage_charge: 0,

            description:
              `TripGuard property owner account for ${req.user.firstName} ${req.user.lastName}`,

            primary_contact_email:
              req.user.email,

            primary_contact_name:
              `${req.user.firstName} ${req.user.lastName}`,

            primary_contact_phone:
              req.user.phone || "",

            metadata:
              JSON.stringify({
                ownerId:
                  req.user._id.toString(),

                platform:
                  "TripGuard",
              }),
          }),
        }
      );

    const subaccountData =
      await subaccountResponse.json();

    if (
      !subaccountResponse.ok ||
      !subaccountData.status ||
      !subaccountData.data
    ) {
      req.user.paymentSetupStatus =
        "failed";

      await req.user.save();

      console.error(
        "Paystack subaccount creation failed:",
        subaccountData
      );

      return res.status(502).json({
        success: false,
        message:
          subaccountData.message ||
          "Unable to create your Paystack payment account",
      });
    }

    const subaccount =
      subaccountData.data;

    /*
     * --------------------------------------------------
     * SAVE SUBACCOUNT INFORMATION
     * --------------------------------------------------
     */

    req.user.paystackSubaccountCode =
      subaccount.subaccount_code ||
      "";

    req.user.paystackSubaccountId =
      subaccount.id
        ? String(subaccount.id)
        : "";

    req.user.paystackSettlementBank =
      subaccount.settlement_bank ||
      "";

    req.user.paystackSettlementAccount =
      subaccount.account_number ||
      normalizedAccountNumber;

    req.user.paystackSettlementAccountName =
      subaccount.account_name ||
      accountName ||
      "";

    req.user.paymentSetupCompleted =
      true;

    req.user.paymentSetupStatus =
      "completed";

    await req.user.save();

    return res.status(201).json({
      success: true,

      message:
        "Payment account connected successfully",

      paymentSetup: {
        completed: true,

        status: "completed",

        subaccountCode:
          req.user
            .paystackSubaccountCode,

        bank:
          req.user
            .paystackSettlementBank,

        accountNumber:
          req.user
            .paystackSettlementAccount,

        accountName:
          req.user
            .paystackSettlementAccountName,
      },
    });
  } catch (error) {
    console.error(
      "Owner payment setup error:",
      error
    );

    try {
      req.user.paymentSetupStatus =
        "failed";

      await req.user.save();
    } catch (saveError) {
      console.error(
        "Unable to update payment setup status:",
        saveError
      );
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to set up your payment account",
    });
  }
};

/*
 * ==================================================
 * TRAVELLER PAYMENT
 * ==================================================
 */

/*
 * --------------------------------------------------
 * INITIALIZE PAYMENT
 * --------------------------------------------------
 *
 * Traveller pays the full booking amount.
 *
 * Example:
 *
 * Booking       ₦100,000
 * TripGuard     ₦10,000
 * Owner         ₦90,000
 *
 * Paystack handles the transaction split.
 */

export const initializePayment = async (
  req,
  res
) => {
  try {
    const { bookingId } =
      req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message:
          "Booking ID is required",
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
     * Find booking belonging to
     * authenticated traveller.
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
        message:
          "Booking not found",
      });
    }

    if (!booking.accommodation) {
      return res.status(400).json({
        success: false,
        message:
          "The accommodation associated with this booking could not be found",
      });
    }

    /*
     * Accommodation must be approved.
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
     * Accommodation must be available.
     */

    if (
      booking.accommodation
        .isAvailable === false
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This accommodation is currently unavailable",
      });
    }

    /*
     * Accommodation must have an owner.
     */

    if (
      !booking.accommodation.owner
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This accommodation does not have a property owner",
      });
    }

    /*
     * Find owner.
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
     * Owner must actually be an owner.
     */

    if (
      propertyOwner.role !==
      "owner"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The accommodation owner account is invalid",
      });
    }

    /*
     * Owner must have completed
     * Paystack setup.
     */

    if (
      !propertyOwner
        .paymentSetupCompleted ||
      !propertyOwner
        .paystackSubaccountCode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This property is not currently ready to accept payments",
      });
    }

    /*
     * Cancelled bookings cannot
     * be paid for.
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
     * Already paid.
     */

    if (
      booking.paymentStatus ===
      "paid"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This booking has already been paid for",
      });
    }

    /*
     * Validate amount.
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
     * payments.
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
     * Calculate 10% / 90% split.
     */

    const {
      commissionRate,
      commissionAmount,
      ownerAmount,
    } =
      calculatePaymentSplit(
        booking.totalAmount
      );

    const reference =
      generateReference();

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
     * Create local payment.
     */

    const payment =
      await Payment.create({
        booking:
          booking._id,

        user:
          req.user.id,

        owner:
          propertyOwner._id,

        property:
          booking
            .accommodation
            ._id,

        amount:
          booking.totalAmount,

        currency: "NGN",

        commissionRate,

        commissionAmount,

        ownerAmount,

        paystackSubaccount:
          propertyOwner
            .paystackSubaccountCode,

        reference,

        status: "pending",

        metadata: {
          bookingId:
            booking._id.toString(),

          accommodationId:
            booking
              .accommodation
              ._id
              .toString(),

          ownerId:
            propertyOwner
              ._id
              .toString(),

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
     * --------------------------------------------------
     * INITIALIZE PAYSTACK TRANSACTION
     * --------------------------------------------------
     */

    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          method: "POST",

          headers:
            getPaystackHeaders(),

          body: JSON.stringify({
            email:
              customerEmail,

            amount:
              amountInKobo,

            currency:
              "NGN",

            reference,

            callback_url:
              `${process.env.CLIENT_URL}/payment/callback`,

            /*
             * Owner's Paystack
             * subaccount.
             */
            subaccount:
              propertyOwner
                .paystackSubaccountCode,

            /*
             * TripGuard's 10%
             * commission.
             */
            transaction_charge:
              transactionChargeInKobo,

            /*
             * Owner's subaccount
             * bears Paystack's
             * transaction fee.
             */
            bearer:
              "subaccount",

            metadata: {
              bookingId:
                booking._id.toString(),

              paymentId:
                payment._id.toString(),

              userId:
                req.user.id.toString(),

              ownerId:
                propertyOwner
                  ._id
                  .toString(),

              accommodationId:
                booking
                  .accommodation
                  ._id
                  .toString(),

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
      !paystackData.status ||
      !paystackData.data
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
     * Save Paystack reference
     * and checkout details.
     */

    payment.paystackReference =
      paystackData.data.reference;

    payment.metadata = {
      ...(payment.metadata || {}),

      accessCode:
        paystackData
          .data
          .access_code,

      authorizationUrl:
        paystackData
          .data
          .authorization_url,
    };

    await payment.save();

    return res.status(201).json({
      success: true,

      message:
        "Payment initialized successfully",

      payment: {
        id:
          payment._id,

        reference:
          payment.reference,

        paystackReference:
          payment.paystackReference,

        amount:
          payment.amount,

        currency:
          payment.currency,

        commissionRate:
          payment
            .commissionRate,

        commissionAmount:
          payment
            .commissionAmount,

        ownerAmount:
          payment.ownerAmount,

        authorizationUrl:
          paystackData
            .data
            .authorization_url,

        accessCode:
          paystackData
            .data
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
 * --------------------------------------------------
 * VERIFY PAYMENT
 * --------------------------------------------------
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
     * Ask Paystack for actual
     * transaction status.
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
      !paystackData.status ||
      !paystackData.data
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
     * Payment wasn't successful.
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
        transaction.channel ||
        "";

      payment.gatewayResponse =
        transaction
          .gateway_response ||
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
 * --------------------------------------------------
 * GET SINGLE PAYMENT
 * --------------------------------------------------
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
 * --------------------------------------------------
 * GET TRAVELLER PAYMENTS
 * --------------------------------------------------
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

      count:
        payments.length,

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
 * --------------------------------------------------
 * GET PAYMENT BY REFERENCE
 * --------------------------------------------------
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
 * ==================================================
 * PAYSTACK WEBHOOK
 * ==================================================
 *
 * IMPORTANT:
 *
 * This route must use:
 *
 * express.raw({
 *   type: "application/json"
 * })
 *
 * Paystack signs the raw request body.
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

      if (
        !process.env.PAYSTACK_SECRET_KEY
      ) {
        return res
          .status(500)
          .send(
            "Paystack is not configured"
          );
      }

      /*
       * --------------------------------------------------
       * GET RAW PAYLOAD
       * --------------------------------------------------
       *
       * Because this route uses express.raw(),
       * req.body should be a Buffer.
       */

      const payload =
        Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              typeof req.body ===
                "string"
                ? req.body
                : JSON.stringify(
                    req.body
                  )
            );

      /*
       * --------------------------------------------------
       * VERIFY PAYSTACK SIGNATURE
       * --------------------------------------------------
       */

      const hash =
        crypto
          .createHmac(
            "sha512",
            process.env
              .PAYSTACK_SECRET_KEY
          )
          .update(payload)
          .digest("hex");

      /*
       * Use timingSafeEqual instead
       * of a normal string comparison.
       */

      const signatureBuffer =
        Buffer.from(
          String(signature),
          "utf8"
        );

      const hashBuffer =
        Buffer.from(
          hash,
          "utf8"
        );

      if (
        signatureBuffer.length !==
          hashBuffer.length ||
        !crypto.timingSafeEqual(
          signatureBuffer,
          hashBuffer
        )
      ) {
        return res
          .status(401)
          .send(
            "Invalid signature"
          );
      }

      /*
       * --------------------------------------------------
       * PARSE EVENT
       * --------------------------------------------------
       */

      let event;

      try {
        event =
          typeof req.body ===
            "object" &&
          !Buffer.isBuffer(
            req.body
          )
            ? req.body
            : JSON.parse(
                payload.toString(
                  "utf8"
                )
              );
      } catch (parseError) {
        console.error(
          "Paystack webhook JSON parse error:",
          parseError
        );

        return res
          .status(400)
          .send(
            "Invalid webhook payload"
          );
      }

      /*
       * --------------------------------------------------
       * ONLY PROCESS CHARGE.SUCCESS
       * --------------------------------------------------
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
        !transaction ||
        !transaction.reference
      ) {
        return res
          .status(200)
          .send(
            "Event received"
          );
      }

      /*
       * --------------------------------------------------
       * FIND LOCAL PAYMENT
       * --------------------------------------------------
       */

      const payment =
        await Payment.findOne({
          reference:
            transaction.reference,
        });

      if (!payment) {
        /*
         * Return 200 so Paystack
         * does not repeatedly retry
         * an unknown payment.
         */

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
       * --------------------------------------------------
       * VERIFY TRANSACTION
       * --------------------------------------------------
       */

      if (
        transaction.status !==
          "success" ||
        Number(
          transaction.amount
        ) !==
          Math.round(
            payment.amount * 100
          )
      ) {
        return res
          .status(200)
          .send(
            "Payment not fulfilled"
          );
      }

      /*
       * --------------------------------------------------
       * MARK SUCCESSFUL
       * --------------------------------------------------
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