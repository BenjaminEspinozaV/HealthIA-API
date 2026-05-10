import express from "express";
import {
  processFoodScan,
  getFoodScanHistory,
  getFoodScanDetail,
  deactivateIaDetection,
} from "../controllers/scanController.js";

const router = express.Router();

router.post("/food", processFoodScan);
router.get("/history/:id_user", getFoodScanHistory);
router.get("/history/detail/:detectionId", getFoodScanDetail);
router.put("/deactivate/:detectionId", deactivateIaDetection);

export default router;