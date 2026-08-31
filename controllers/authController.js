import jwt from "jsonwebtoken";
import User from "../models/users.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/sendEmail.js";

const generateToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const hashVerificationToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const sendTokenResponse = (user, statusCode, res, message) => {
  const token = generateToken(user._id);

  res
    .status(statusCode)
    .cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      success: true,
      message,

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
};


//register
export const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      role,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "First name, last name, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Only allow user or owner during public registration.
    // Admin accounts should be created separately.
    const userRole = role === "owner" ? "owner" : "user";

    /*
     * Generate email verification token
     *
     * The raw token goes into the email.
     * Only the hashed token is stored in MongoDB.
     */
    const verificationToken = generateVerificationToken();

    const hashedVerificationToken = hashVerificationToken(
      verificationToken
    );

    /*
     * Verification link expires after 24 hours.
     */
    const verificationTokenExpires = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password,
      phone: phone?.trim() || "",
      role: userRole,

      isVerified: false,

      verificationToken: hashedVerificationToken,
      verificationTokenExpires,
    });

    /*
     * Role-specific instructions
     */
    const roleContent =
      userRole === "owner"
        ? {
            title: "Welcome to TripGuard as an Accommodation Owner",
            intro:
              "TripGuard helps accommodation owners connect with guests while making stays safer and easier to manage.",
            steps: [
              "Complete your owner profile.",
              "Add your accommodation with accurate details, photos, amenities and pricing.",
              "Keep your accommodation availability up to date.",
              "Manage incoming bookings from your dashboard.",
              "Prepare your guests for a safe and comfortable stay.",
            ],
          }
        : {
            title: "Welcome to TripGuard",
            intro:
              "TripGuard helps you discover accommodation and enjoy a safer, more confident travel experience.",
            steps: [
              "Complete your profile.",
              "Search for accommodation based on your needs and location.",
              "Review accommodation details, amenities and pricing.",
              "Make your booking through TripGuard.",
              "Use TripGuard's safety features to keep your loved ones informed during your stay.",
            ],
          };

    const verificationUrl =
  `${process.env.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(
    user.email
  )}`;

    await sendEmail({
      to: user.email,
      subject: "Verify your TripGuard account",
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

              <h2 style="
                color: #173C37;
                font-size: 22px;
                margin-top: 25px;
              ">
                ${roleContent.title}
              </h2>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                ${roleContent.intro}
              </p>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                Before you can use your account, please verify your email
                address by clicking the button below.
              </p>

              <div style="
                text-align: center;
                margin: 30px 0;
              ">
                <a
                  href="${verificationUrl}"
                  style="
                    display: inline-block;
                    background: #173C37;
                    color: #ffffff;
                    text-decoration: none;
                    padding: 14px 26px;
                    border-radius: 10px;
                    font-weight: bold;
                    font-size: 15px;
                  "
                >
                  Verify My Account
                </a>
              </div>

              <div style="
                background: #E1F5ED;
                border-radius: 12px;
                padding: 20px;
                margin-top: 30px;
              ">

                <h3 style="
                  margin-top: 0;
                  color: #173C37;
                  font-size: 17px;
                ">
                  How to use TripGuard
                </h3>

                <ol style="
                  color: #53635e;
                  line-height: 1.8;
                  padding-left: 20px;
                  font-size: 14px;
                ">
                  ${roleContent.steps
                    .map((step) => `<li>${step}</li>`)
                    .join("")}
                </ol>

              </div>

              <p style="
                color: #7b8783;
                font-size: 13px;
                line-height: 1.6;
                margin-top: 30px;
              ">
                This verification link will expire in
                <strong>24 hours</strong>.
              </p>

              <p style="
                color: #7b8783;
                font-size: 13px;
                line-height: 1.6;
              ">
                If you did not create a TripGuard account, you can safely
                ignore this email.
              </p>

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
                © ${new Date().getFullYear()} TripGuard. All rights reserved.
              </p>
            </div>

          </div>

        </div>
      `,
    });

    /*
     * IMPORTANT:
     * Do NOT log the verification token.
     * Do NOT send a JWT yet.
     *
     * The account must first be verified.
     */
    return res.status(201).json({
      success: true,
      message:
        "Account created successfully. Please check your email to verify your account.",
      emailVerificationRequired: true,
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account",
    });
  }
};

//login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified) {
  return res.status(403).json({
    success: false,
    message:
      "Please verify your email address before logging in.",
    emailVerificationRequired: true,
  });
}

    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res, "Login successful");
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to log in",
    });
  }
};

export const logout = async (req, res) => {
  try {
    res
      .cookie("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        expires: new Date(0),
      })
      .status(200)
      .json({
        success: true,
        message: "Logged out successfully",
      });
  } catch (error) {
    console.error("Logout error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to log out",
    });
  }
};

export const getMe = async (req, res) => {
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
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve user",
    });
  }
};

export { getMe as getCurrentUser };

//otp send

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+passwordResetOtp +passwordResetOtpExpires +passwordResetVerified"
    );

    // Don't reveal whether an account exists.
   if (!user) {
  return res.status(404).json({
    success: false,
    message: "No TripGuard account was found with this email address.",
  });
}

   if (!user.isActive) {
  return res.status(403).json({
    success: false,
    message: "This TripGuard account has been deactivated.",
  });
}

    // Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Hash the OTP before saving it
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.passwordResetOtp = hashedOtp;

    // OTP expires after 10 minutes
    user.passwordResetOtpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    user.passwordResetVerified = false;

    await user.save();

    await sendEmail({
      to: user.email,
      subject: "TripGuard Password Reset OTP",
      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 30px;
          color: #333;
        ">
          <h2 style="color: #111;">TripGuard Password Reset</h2>

          <p>Hello ${user.firstName},</p>

          <p>
            We received a request to reset your TripGuard password.
          </p>

          <p>
            Your password reset OTP is:
          </p>

          <div style="
            background: #f4f4f4;
            padding: 18px;
            text-align: center;
            border-radius: 8px;
            margin: 25px 0;
          ">
            <span style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
            ">
              ${otp}
            </span>
          </div>

          <p>
            This OTP will expire in <strong>10 minutes</strong>.
          </p>

          <p>
            If you did not request a password reset, you can safely ignore
            this email.
          </p>

          <p>
            Stay safe,<br />
            <strong>The TripGuard Team</strong>
          </p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message:
        "If an account with that email exists, a password reset OTP has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request",
    });
  }
};

//otp verification

export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+passwordResetOtp +passwordResetOtpExpires +passwordResetVerified"
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if (
      !user.passwordResetOtp ||
      !user.passwordResetOtpExpires
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if (user.passwordResetOtpExpires < new Date()) {
      user.passwordResetOtp = undefined;
      user.passwordResetOtpExpires = undefined;
      user.passwordResetVerified = false;

      await user.save();

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    const isOtpCorrect = await bcrypt.compare(
      otp.toString(),
      user.passwordResetOtp
    );

    if (!isOtpCorrect) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    user.passwordResetVerified = true;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify reset OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
    });
  }
};

//reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+password +passwordResetOtp +passwordResetOtpExpires +passwordResetVerified"
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Unable to reset password",
      });
    }

    if (!user.passwordResetVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your OTP first",
      });
    }

    if (
      !user.passwordResetOtpExpires ||
      user.passwordResetOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Password reset session has expired",
      });
    }

    user.password = newPassword;

    // Clear password reset data
    user.passwordResetOtp = undefined;
    user.passwordResetOtpExpires = undefined;
    user.passwordResetVerified = false;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password",
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const hashedToken = hashVerificationToken(token);

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+verificationToken +verificationTokenExpires"
    );

    if (!user) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=not-found`
      );
    }

    if (user.isVerified) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verified=already`
      );
    }

    if (
      !user.verificationToken ||
      !user.verificationTokenExpires
    ) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    if (user.verificationTokenExpires < new Date()) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=expired`
      );
    }

    if (user.verificationToken !== hashedToken) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    // =========================
    // VERIFY ACCOUNT
    // =========================

    user.isVerified = true;

    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    await user.save();

    // =========================
    // SEND USER TO LOGIN
    // =========================

    return res.redirect(
      `${process.env.CLIENT_URL}/login?verified=true`
    );
  } catch (error) {
    console.error("Verify email error:", error);

    return res.redirect(
      `${process.env.CLIENT_URL}/login?verification=error`
    );
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select(
      "+verificationToken +verificationTokenExpires"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No TripGuard account was found with this email address.",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "This account has already been verified.",
      });
    }

    const verificationToken = generateVerificationToken();

    const hashedVerificationToken =
      hashVerificationToken(verificationToken);

    user.verificationToken = hashedVerificationToken;

    user.verificationTokenExpires = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    await user.save();

   const verificationUrl =
  `${process.env.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(
    user.email
  )}`;

    const roleInstructions =
      user.role === "owner"
        ? `
          <li>Complete your owner profile.</li>
          <li>Add and manage your accommodation.</li>
          <li>Keep availability and property information updated.</li>
          <li>Manage guest bookings from your dashboard.</li>
        `
        : `
          <li>Complete your profile.</li>
          <li>Search for suitable accommodation.</li>
          <li>Review property details before booking.</li>
          <li>Manage your bookings from your dashboard.</li>
          <li>Use TripGuard's safety features during your stay.</li>
        `;

    await sendEmail({
      to: user.email,
      subject: "Verify your TripGuard account",
      html: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 30px;
          color: #172322;
        ">

          <div style="
            background: #173C37;
            padding: 25px;
            text-align: center;
            border-radius: 12px 12px 0 0;
          ">
            <h1 style="color: white; margin: 0;">
              TripGuard
            </h1>
          </div>

          <div style="
            padding: 30px;
            border: 1px solid #e4e8e6;
            border-top: none;
          ">

            <p>Hello ${user.firstName},</p>

            <p style="line-height: 1.7;">
              Here is your new TripGuard email verification link.
              Click the button below to verify your account.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a
                href="${verificationUrl}"
                style="
                  display: inline-block;
                  background: #173C37;
                  color: white;
                  text-decoration: none;
                  padding: 14px 25px;
                  border-radius: 10px;
                  font-weight: bold;
                "
              >
                Verify My Account
              </a>
            </div>

            <div style="
              background: #E1F5ED;
              padding: 20px;
              border-radius: 10px;
            ">

              <h3 style="color: #173C37;">
                Getting started with TripGuard
              </h3>

              <ol style="
                color: #53635e;
                line-height: 1.8;
              ">
                ${roleInstructions}
              </ol>

            </div>

            <p style="
              color: #7b8783;
              font-size: 13px;
              margin-top: 25px;
            ">
              This verification link expires in
              <strong>24 hours</strong>.
            </p>

            <p style="margin-top: 25px;">
              Stay safe,<br />
              <strong>The TripGuard Team</strong>
            </p>

          </div>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message:
        "A new verification email has been sent to your email address.",
    });
  } catch (error) {
    console.error("Resend verification email error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to resend verification email",
    });
  }
};