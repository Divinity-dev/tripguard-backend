import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: "user",
    },

    profileImage: {
      type: String,
      default: "",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /*
     * Password reset / OTP fields
     */

    passwordResetOtp: {
      type: String,
      select: false,
    },

    passwordResetOtpExpires: {
      type: Date,
      select: false,
    },

    passwordResetVerified: {
      type: Boolean,
      default: false,
      select: false,
    },

    /*
     * --------------------------------------------------
     * PAYSTACK OWNER PAYMENT INFORMATION
     * --------------------------------------------------
     *
     * Only property owners will use these fields.
     *
     * TripGuard has one main Paystack account.
     * Each property owner receives a Paystack
     * subaccount for receiving their booking funds.
     */

    paystackSubaccountCode: {
      type: String,
      default: "",
      trim: true,
    },

    paystackSubaccountId: {
      type: String,
      default: "",
      trim: true,
    },

    /*
     * Bank information used when creating
     * the owner's Paystack subaccount.
     */

    paystackSettlementBank: {
      type: String,
      default: "",
      trim: true,
    },

    paystackSettlementAccount: {
      type: String,
      default: "",
      trim: true,
    },

    paystackSettlementAccountName: {
      type: String,
      default: "",
      trim: true,
    },

    /*
     * Indicates whether the owner has successfully
     * completed payment setup.
     */
    paymentSetupCompleted: {
      type: Boolean,
      default: false,
    },

    /*
     * Tracks the owner's Paystack onboarding status.
     */
    paymentSetupStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "completed",
        "failed",
      ],
      default: "not_started",
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Hash password before saving.
 */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(
    this.password,
    salt
  );

  next();
});

/*
 * Compare password during login.
 */
userSchema.methods.comparePassword = async function (
  candidatePassword
) {
  return bcrypt.compare(
    candidatePassword,
    this.password
  );
};

const User = mongoose.model("User", userSchema);

export default User;