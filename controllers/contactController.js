import ContactMessage from "../models/ContactMessage.js";

export const createContactMessage = async (req, res) => {
  try {
    const {
      name,
      email,
      subject,
      message,
    } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, subject and message are required",
      });
    }

    const contactMessage = await ContactMessage.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      subject,
      message: message.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Your message has been sent successfully",
      contactMessage: {
        id: contactMessage._id,
        name: contactMessage.name,
        email: contactMessage.email,
        subject: contactMessage.subject,
        message: contactMessage.message,
        status: contactMessage.status,
        createdAt: contactMessage.createdAt,
      },
    });
  } catch (error) {
    console.error("Create contact message error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to send your message",
    });
  }
};

export const getMyContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find({
      email: req.user.email,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error("Get my contact messages error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve your messages",
    });
  }
}