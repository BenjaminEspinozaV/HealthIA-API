import express from "express";
import {
  getOnboarding,
  getUser,
  getUsers,
  saveOnboarding,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/", getUsers);
router.get("/onboarding/:idUser", getOnboarding);
router.post("/onboarding", saveOnboarding);
router.get("/:id", getUser);

export default router;
