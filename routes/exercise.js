import express from "express";
import {
  addExercise,
  getExercisesByUser,
  saveExerciseRoutine,
} from "../controllers/exerciseController.js";

const router = express.Router();

router.post("/", addExercise);
router.post("/routine", saveExerciseRoutine);
router.get("/:userId", getExercisesByUser);

export default router;
