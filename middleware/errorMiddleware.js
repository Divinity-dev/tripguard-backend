export const notFound = (req, res, next) => {
  const error = new Error(
    `Route not found: ${req.originalUrl}`
  );

  res.status(404);

  next(error);
};

export const errorHandler = (error, req, res, next) => {
  console.error("Server error:", error);

  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  let message = error.message || "Internal server error";

  // Mongoose bad ObjectId
  if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID.";
  }

  // Mongoose validation error
  if (error.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((item) => item.message)
      .join(", ");
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    statusCode = 409;

    const duplicateField = Object.keys(
      error.keyValue || {}
    )[0];

    message = duplicateField
      ? `${duplicateField} already exists.`
      : "A record with these details already exists.";
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}