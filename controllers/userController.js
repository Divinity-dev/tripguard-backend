import bcrypt from "bcryptjs";
import User from "../models/users.js";

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

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to change password",
    });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

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
        secure: process.env.NODE_ENV === "production",
        sameSite:
          process.env.NODE_ENV === "production" ? "none" : "lax",
        expires: new Date(0),
      })
      .json({
        success: true,
        message: "Account deactivated successfully",
      });
  } catch (error) {
    console.error("Delete account error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to deactivate account",
    });
  }
}