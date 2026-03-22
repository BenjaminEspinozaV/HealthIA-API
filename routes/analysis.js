
import express from "express";
import {addAnalysis} from "../controllers/aiAnalysisController.js";
const router = express.Router();

router.post("/",addAnalysis);

export default router;
