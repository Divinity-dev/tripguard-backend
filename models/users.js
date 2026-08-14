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
     * --------------------------------------------------
     * PASSWORD RESET / OTP
     * --------------------------------------------------
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
     * --------------------------------------------------
     * OWNER BANK INFORMATION
     * --------------------------------------------------
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
     * --------------------------------------------------
     * PAYMENT SETUP STATUS
     * --------------------------------------------------
     */

    paymentSetupCompleted: {
      type: Boolean,
      default: false,
    },

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

    /*
     * --------------------------------------------------
     * LOGIN INFORMATION
     * --------------------------------------------------
     */

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
 * --------------------------------------------------
 * HASH PASSWORD BEFORE SAVING
 * --------------------------------------------------
 *
 * This uses async/promise middleware.
 *
 * Do NOT use next() here.
 */
userSchema.pre("save", async function () {
  /*
   * If password hasn't changed, don't hash it again.
   */
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(
    this.password,
    salt
  );
});

/*
 * --------------------------------------------------
 * COMPARE PASSWORD
 * --------------------------------------------------
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