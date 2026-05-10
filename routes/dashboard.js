import express from "express";
import {
  getDashboardRaw,
  getUserProfile,
  updateUserProfile,
  updateUserStats,
  updateUserGoal,
  getDailyLog,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/raw/:idUser", getDashboardRaw);
router.get("/users/:idUser", getUserProfile);
router.put("/users/profile/:idUser", updateUserProfile);
router.put("/users/:idUser/stats", updateUserStats);
router.put("/users/:idUser/goal", updateUserGoal);
router.get("/daily-log/:idUser", getDailyLog);
router.get("/daily-log/:idUser/:date", getDailyLog);
export default router;