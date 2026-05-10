import express from "express";
import { getAdminAnalyticsRaw } from "../controllers/adminAnalyticsController.js";

const router = express.Router();

router.get("/raw", getAdminAnalyticsRaw);

export default router;