
import express from "express";
import {getDailyLog} from "../controllers/dailyLogController.js";
const router = express.Router();

router.get("/:userId",getDailyLog);

export default router;
