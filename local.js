import "dotenv/config";

import app from "./server.js";
import connectDB from "./config/db.js";

const PORT = process.env.PORT || 5000;

try {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`TripGuard API running locally on port ${PORT}`);
  });
} catch (error) {
  console.error("Unable to start TripGuard API:", error.message);
  process.exitCode = 1;
}
