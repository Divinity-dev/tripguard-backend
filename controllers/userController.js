import bcrypt from "bcryptjs";
import User from "../models/users.js";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

/*
 * GET PROFILE
 */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

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
    console.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve profile",
    });
  }
};

/*
 * UPDATE PROFILE
 */
export const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      profileImage,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (firstName !== undefined) {
      user.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      user.lastName = lastName.trim();
    }

    if (phone !== undefined) {
      user.phone = phone.trim();
    }

    if (profileImage !== undefined) {
      user.profileImage = profileImage.trim();
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

/*
 * CHANGE PASSWORD
 */
export const changePassword = async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(
      req.user.id
    ).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordCorrect =
      await bcrypt.compare(
        currentPassword,
        user.password
      );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message:
          "Current password is incorrect",
      });
    }

    user.password = newPassword;

    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully",
    });
  } catch (error) {
    console.error(
      "Change password error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to change password",
    });
  }
};

/*
 * DELETE / DEACTIVATE ACCOUNT
 */
export const deleteAccount = async (
  req,
  res
) => {
  try {
    const user = await User.findById(
      req.user.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isActive = false;

    await user.save();

    res
      .status(200)
      .cookie("token", "", {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite:
          process.env.NODE_ENV ===
          "production"
            ? "none"
            : "lax",
        expires: new Date(0),
      })
      .json({
        success: true,
        message:
          "Account deactivated successfully",
      });
  } catch (error) {
    console.error(
      "Delete account error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to deactivate account",
    });
  }
};

/*
 * SETUP OWNER PAYMENT ACCOUNT
 *
 * Each owner gets ONE Paystack subaccount.
 *
 * That same subaccount is reused for every
 * accommodation owned by this user.
 *
 * Required body:
 *
 * {
 *   bankCode: "058",
 *   accountNumber: "0123456789"
 * }
 */
export const setupPaymentAccount = async (
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

    const user = await User.findById(
      req.user.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "owner") {
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

    if (!bankCode || !accountNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Bank code and account number are required",
      });
    }

    const cleanBankCode =
      String(bankCode).trim();

    const cleanAccountNumber =
      String(accountNumber).trim();

    if (!/^\d+$/.test(cleanAccountNumber)) {
      return res.status(400).json({
        success: false,
        message:
          "Account number must contain only numbers",
      });
    }

    if (
      cleanAccountNumber.length < 10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid bank account number",
      });
    }

    /*
     * If this owner already has a Paystack
     * subaccount, do NOT create another one.
     *
     * Update the existing subaccount instead.
     */
    if (user.paystackSubaccountCode) {
      const paystackResponse =
        await fetch(
          `${PAYSTACK_BASE_URL}/subaccount/${encodeURIComponent(
            user.paystackSubaccountCode
          )}`,
          {
            method: "PUT",
            headers:
              getPaystackHeaders(),
            body: JSON.stringify({
              business_name: `${user.firstName} ${user.lastName}`,
              bank_code: cleanBankCode,
              account_number:
                cleanAccountNumber,
              primary_contact_name: `${user.firstName} ${user.lastName}`,
              primary_contact_email:
                user.email,
              primary_contact_phone:
                user.phone || "",
              active: true,
            }),
          }
        );

      const paystackData =
        await paystackResponse.json();

      if (
        !paystackResponse.ok ||
        !paystackData.status
      ) {
        user.paymentSetupStatus =
          "failed";

        await user.save();

        console.error(
          "Paystack subaccount update failed:",
          paystackData
        );

        return res.status(502).json({
          success: false,
          message:
            paystackData.message ||
            "Unable to update your payment account",
        });
      }

      const subaccount =
        paystackData.data;

      user.paystackSubaccountCode =
        subaccount.subaccount_code ||
        user.paystackSubaccountCode;

      user.paystackSubaccountId =
        subaccount.id?.toString() ||
        user.paystackSubaccountId;

      user.paystackSettlementBank =
        subaccount.settlement_bank ||
        "";

      user.paystackSettlementAccount =
        subaccount.account_number ||
        cleanAccountNumber;

      user.paystackSettlementAccountName =
        subaccount.account_name ||
        "";

      user.paymentSetupCompleted = true;
      user.paymentSetupStatus =
        "completed";

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Payment account updated successfully",
        paymentAccount: {
          subaccountCode:
            user.paystackSubaccountCode,
          subaccountId:
            user.paystackSubaccountId,
          bank:
            user.paystackSettlementBank,
          accountNumber:
            user.paystackSettlementAccount,
          accountName:
            user.paystackSettlementAccountName,
          setupCompleted:
            user.paymentSetupCompleted,
          setupStatus:
            user.paymentSetupStatus,
          isVerified:
            subaccount.is_verified ??
            false,
          active:
            subaccount.active ??
            true,
        },
      });
    }

    /*
     * First-time setup.
     *
     * Create ONE Paystack subaccount
     * for this owner.
     */
    user.paymentSetupStatus =
      "pending";

    await user.save();

    const businessName =
      `${user.firstName} ${user.lastName}`;

    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/subaccount`,
        {
          method: "POST",
          headers:
            getPaystackHeaders(),
          body: JSON.stringify({
            business_name:
              businessName,

            settlement_bank:
              cleanBankCode,

            account_number:
              cleanAccountNumber,

            percentage_charge: 0,

            description:
              `TripGuard property owner account for ${businessName}`,

            primary_contact_name:
              businessName,

            primary_contact_email:
              user.email,

            primary_contact_phone:
              user.phone || "",

            metadata: JSON.stringify({
              userId:
                user._id.toString(),
              platform:
                "TripGuard",
            }),
          }),
        }
      );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      user.paymentSetupCompleted =
        false;

      user.paymentSetupStatus =
        "failed";

      await user.save();

      console.error(
        "Paystack subaccount creation failed:",
        paystackData
      );

      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to create your payment account",
      });
    }

    const subaccount =
      paystackData.data;

    /*
     * Save Paystack's subaccount information
     * against the owner.
     */
    user.paystackSubaccountCode =
      subaccount.subaccount_code;

    user.paystackSubaccountId =
      subaccount.id?.toString() || "";

    user.paystackSettlementBank =
      subaccount.settlement_bank || "";

    user.paystackSettlementAccount =
      subaccount.account_number ||
      cleanAccountNumber;

    user.paystackSettlementAccountName =
      subaccount.account_name || "";

    user.paymentSetupCompleted = true;

    user.paymentSetupStatus =
      "completed";

    await user.save();

    return res.status(201).json({
      success: true,
      message:
        "Payment account created successfully",
      paymentAccount: {
        subaccountCode:
          user.paystackSubaccountCode,

        subaccountId:
          user.paystackSubaccountId,

        bank:
          user.paystackSettlementBank,

        accountNumber:
          user.paystackSettlementAccount,

        accountName:
          user.paystackSettlementAccountName,

        setupCompleted:
          user.paymentSetupCompleted,

        setupStatus:
          user.paymentSetupStatus,

        isVerified:
          subaccount.is_verified ??
          false,

        active:
          subaccount.active ??
          true,
      },
    });
  } catch (error) {
    console.error(
      "Setup payment account error:",
      error
    );

    /*
     * Do not expose Paystack's internal
     * error details to the client.
     */
    try {
      await User.findByIdAndUpdate(
        req.user.id,
        {
          paymentSetupStatus:
            "failed",
          paymentSetupCompleted:
            false,
        }
      );
    } catch (updateError) {
      console.error(
        "Payment setup status update error:",
        updateError
      );
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to set up payment account",
    });
  }
};

/*
 * GET OWNER PAYMENT ACCOUNT
 *
 * Returns the payment account belonging
 * to the authenticated owner.
 */
export const getPaymentAccount = async (
  req,
  res
) => {
  try {
    const user = await User.findById(
      req.user.id
    ).select(
      "role paystackSubaccountCode paystackSubaccountId paystackSettlementBank paystackSettlementAccount paystackSettlementAccountName paymentSetupCompleted paymentSetupStatus"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "owner") {
      return res.status(403).json({
        success: false,
        message:
          "Only property owners have payment accounts",
      });
    }

    if (
      !user.paystackSubaccountCode
    ) {
      return res.status(200).json({
        success: true,
        paymentAccount: null,
        setupCompleted:
          false,
        setupStatus:
          user.paymentSetupStatus,
      });
    }

    /*
     * Return the local information first.
     *
     * We do not need to call Paystack every
     * time the owner opens their profile.
     */
    return res.status(200).json({
      success: true,
      paymentAccount: {
        subaccountCode:
          user.paystackSubaccountCode,

        subaccountId:
          user.paystackSubaccountId,

        bank:
          user.paystackSettlementBank,

        accountNumber:
          user.paystackSettlementAccount,

        accountName:
          user.paystackSettlementAccountName,

        setupCompleted:
          user.paymentSetupCompleted,

        setupStatus:
          user.paymentSetupStatus,
      },
    });
  } catch (error) {
    console.error(
      "Get payment account error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve payment account",
    });
  }
};

/*
 * UPDATE OWNER PAYMENT ACCOUNT
 *
 * This uses the owner's existing Paystack
 * subaccount rather than creating another one.
 */
export const updatePaymentAccount = async (
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

    const user = await User.findById(
      req.user.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "owner") {
      return res.status(403).json({
        success: false,
        message:
          "Only property owners can update payment accounts",
      });
    }

    if (
      !user.paystackSubaccountCode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You do not have a payment account yet. Please set one up first.",
      });
    }

    const {
      bankCode,
      accountNumber,
    } = req.body;

    if (!bankCode || !accountNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Bank code and account number are required",
      });
    }

    const cleanBankCode =
      String(bankCode).trim();

    const cleanAccountNumber =
      String(accountNumber).trim();

    if (
      !/^\d+$/.test(
        cleanAccountNumber
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Account number must contain only numbers",
      });
    }

    if (
      cleanAccountNumber.length < 10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid bank account number",
      });
    }

    user.paymentSetupStatus =
      "pending";

    await user.save();

    const paystackResponse =
      await fetch(
        `${PAYSTACK_BASE_URL}/subaccount/${encodeURIComponent(
          user.paystackSubaccountCode
        )}`,
        {
          method: "PUT",
          headers:
            getPaystackHeaders(),
          body: JSON.stringify({
            business_name: `${user.firstName} ${user.lastName}`,

            bank_code:
              cleanBankCode,

            account_number:
              cleanAccountNumber,

            primary_contact_name:
              `${user.firstName} ${user.lastName}`,

            primary_contact_email:
              user.email,

            primary_contact_phone:
              user.phone || "",

            active: true,
          }),
        }
      );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      user.paymentSetupStatus =
        "failed";

      await user.save();

      console.error(
        "Paystack payment account update failed:",
        paystackData
      );

      return res.status(502).json({
        success: false,
        message:
          paystackData.message ||
          "Unable to update payment account",
      });
    }

    const subaccount =
      paystackData.data;

    user.paystackSubaccountCode =
      subaccount.subaccount_code ||
      user.paystackSubaccountCode;

    user.paystackSubaccountId =
      subaccount.id?.toString() ||
      user.paystackSubaccountId;

    user.paystackSettlementBank =
      subaccount.settlement_bank ||
      "";

    user.paystackSettlementAccount =
      subaccount.account_number ||
      cleanAccountNumber;

    user.paystackSettlementAccountName =
      subaccount.account_name ||
      "";

    user.paymentSetupCompleted =
      true;

    user.paymentSetupStatus =
      "completed";

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Payment account updated successfully",
      paymentAccount: {
        subaccountCode:
          user.paystackSubaccountCode,

        subaccountId:
          user.paystackSubaccountId,

        bank:
          user.paystackSettlementBank,

        accountNumber:
          user.paystackSettlementAccount,

        accountName:
          user.paystackSettlementAccountName,

        setupCompleted:
          user.paymentSetupCompleted,

        setupStatus:
          user.paymentSetupStatus,

        isVerified:
          subaccount.is_verified ??
          false,

        active:
          subaccount.active ??
          true,
      },
    });
  } catch (error) {
    console.error(
      "Update payment account error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update payment account",
    });
  }
};