import express from "express";
import {
  getOnboarding,
  getUser,
  getUsers,
  saveOnboarding,
  updateUserStatus,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/", getUsers);
router.get("/onboarding/:idUser", getOnboarding);
router.post("/onboarding", saveOnboarding);
router.get("/:id", getUser);
router.put("/:id/status",updateUserStatus);
export default router;
