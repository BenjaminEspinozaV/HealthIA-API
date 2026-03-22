
import express from "express";
import {getActivity} from "../controllers/activityController.js";
const router = express.Router();

router.get("/:userId",getActivity);

export default router;
