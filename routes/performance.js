import express from "express";
import { getPerformanceRaw } from "../controllers/performanceController.js";

const router = express.Router();

router.get("/raw/:idUser", getPerformanceRaw);

export default router;