import express from "express";
import { saveStats } from "../controllers/statsController.js";

const router = express.Router();

router.post("/", saveStats);

export default router;