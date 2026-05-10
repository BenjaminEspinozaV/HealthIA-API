import express from "express";
import {
  getUserIntensityHistory,
  setActiveIntensity,
} from "../controllers/intensityHistoryController.js";

const router = express.Router();

router.get("/:idUser", getUserIntensityHistory);
router.post("/:idUser/active", setActiveIntensity);

export default router;