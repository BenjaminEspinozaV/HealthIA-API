
import express from "express";
import {getObjective} from "../controllers/objectiveController.js";
const router = express.Router();

router.get("/:userId",getObjective);

export default router;
