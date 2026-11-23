import Notification from "../models/notifications.js";

const createNotification = async ({
  recipient,
  type,
  title,
  message,
  booking = null,
  accommodation = null,
  priority = "normal",
  actionUrl = "",
  expiresAt = null,
}) => {
  try {
    if (!recipient) {
      console.error(
        "Notification creation skipped: recipient is missing"
      );

      return null;
    }

    const notification = await Notification.create({
      recipient,
      type,
      title,
      message,
      booking,
      accommodation,
      priority,
      actionUrl,
      expiresAt,
    });

    return notification;
  } catch (error) {
    /*
     * Notification failure should NEVER cause
     * the actual booking/payment operation to fail.
     */
    console.error(
      "Notification creation error:",
      error
    );

    return null;
  }
};

export default createNotification;