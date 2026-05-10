import express from "express";
import {

  getUser,
  getUsers,

  updateUserStatus,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/", getUsers);

router.get("/:id", getUser);
router.put("/:id/status",updateUserStatus);
export default router;
