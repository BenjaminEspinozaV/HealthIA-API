import express from "express";
import {
  getIntensityById,
  getIntensityLevels,
} from "../controllers/intensityController.js";

const router = express.Router();

router.get("/", getIntensityLevels);
router.get("/:id", getIntensityById);

export default router;