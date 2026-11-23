import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/users.js";

dotenv.config();

const verifyExistingUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB.");

    const result = await User.updateMany(
      {
        isVerified: { $ne: true },
      },
      {
        $set: {
          isVerified: true,
        },
        $unset: {
          verificationToken: "",
          verificationTokenExpires: "",
        },
      }
    );

    console.log(
      `Migration completed successfully. ${result.modifiedCount} existing account(s) verified.`
    );
  } catch (error) {
    console.error(
      "Migration failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
};

verifyExistingUsers();