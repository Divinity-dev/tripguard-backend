import SavedAccommodation from "../models/savedAccommodation.js";
import Accommodation from "../models/accommodations.js";

/*
 * --------------------------------------------------
 * SAVE ACCOMMODATION
 * --------------------------------------------------
 */

export const saveAccommodation = async (req, res) => {
  try {
    const { accommodationId } = req.params;

    const accommodation =
      await Accommodation.findById(accommodationId);

    if (!accommodation) {
      return res.status(404).json({
        message: "Accommodation not found",
      });
    }

    const existingSave =
      await SavedAccommodation.findOne({
        user: req.user._id,
        accommodation: accommodationId,
      });

    if (existingSave) {
      return res.status(409).json({
        message: "Accommodation is already saved",
      });
    }

    const savedAccommodation =
      await SavedAccommodation.create({
        user: req.user._id,
        accommodation: accommodationId,
      });

    return res.status(201).json({
      message: "Accommodation saved successfully",
      savedAccommodation,
    });
  } catch (error) {
    console.error(
      "Save accommodation error:",
      error
    );

    return res.status(500).json({
      message: "Unable to save accommodation",
    });
  }
};

/*
 * --------------------------------------------------
 * REMOVE SAVED ACCOMMODATION
 * --------------------------------------------------
 */

export const removeSavedAccommodation =
  async (req, res) => {
    try {
      const { accommodationId } = req.params;

      const savedAccommodation =
        await SavedAccommodation.findOneAndDelete({
          user: req.user._id,
          accommodation: accommodationId,
        });

      if (!savedAccommodation) {
        return res.status(404).json({
          message: "Saved accommodation not found",
        });
      }

      return res.status(200).json({
        message:
          "Accommodation removed from saved stays",
      });
    } catch (error) {
      console.error(
        "Remove saved accommodation error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to remove saved accommodation",
      });
    }
  };

/*
 * --------------------------------------------------
 * GET MY SAVED ACCOMMODATIONS
 * --------------------------------------------------
 */

export const getMySavedAccommodations =
  async (req, res) => {
    try {
      const savedAccommodations =
        await SavedAccommodation.find({
          user: req.user._id,
        })
          .populate("accommodation")
          .sort({ createdAt: -1 });

      return res.status(200).json({
        savedAccommodations,
      });
    } catch (error) {
      console.error(
        "Get saved accommodations error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve saved accommodations",
      });
    }
  };

/*
 * --------------------------------------------------
 * CHECK WHETHER AN ACCOMMODATION IS SAVED
 * --------------------------------------------------
 */

export const checkSavedAccommodation =
  async (req, res) => {
    try {
      const { accommodationId } = req.params;

      const savedAccommodation =
        await SavedAccommodation.findOne({
          user: req.user._id,
          accommodation: accommodationId,
        });

      return res.status(200).json({
        saved: Boolean(savedAccommodation),
      });
    } catch (error) {
      console.error(
        "Check saved accommodation error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to check saved accommodation",
      });
    }
  };

/*
 * --------------------------------------------------
 * GET SAVED ACCOMMODATIONS COUNT
 * --------------------------------------------------
 */

export const getSavedAccommodationCount =
  async (req, res) => {
    try {
      const count =
        await SavedAccommodation.countDocuments({
          user: req.user._id,
        });

      return res.status(200).json({
        count,
      });
    } catch (error) {
      console.error(
        "Get saved accommodation count error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve saved accommodation count",
      });
    }
  };