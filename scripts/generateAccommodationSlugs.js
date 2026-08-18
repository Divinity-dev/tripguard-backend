import mongoose from "mongoose";
import Accommodation from "../models/accommodations.js";
import dotenv from "dotenv";

dotenv.config();

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const generateUniqueSlug = async (name, accommodationId) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const existingAccommodation = await Accommodation.findOne({
      slug,
      _id: { $ne: accommodationId },
    });

    if (!existingAccommodation) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

const migrateSlugs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const accommodations = await Accommodation.find({
      $or: [
        { slug: { $exists: false } },
        { slug: null },
        { slug: "" },
      ],
    });

    console.log(
      `Found ${accommodations.length} accommodations without slugs`
    );

    for (const accommodation of accommodations) {
      accommodation.slug = await generateUniqueSlug(
        accommodation.name,
        accommodation._id
      );

      await accommodation.save();

      console.log(
        `Created slug: ${accommodation.name} → ${accommodation.slug}`
      );
    }

    console.log("Slug migration completed successfully");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Slug migration failed:", error);

    await mongoose.disconnect();

    process.exit(1);
  }
};

migrateSlugs();