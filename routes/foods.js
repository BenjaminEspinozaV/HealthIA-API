import express from "express";
import {
  getFoods,
  getFoodsGrouped,
  getUserFoods,
  getAvailableFoodsForUser,
  addFoodsToUser,
  removeFoodFromUser,
} from "../controllers/foodsController.js";

const router = express.Router();

router.get("/", getFoods);
router.get("/grouped", getFoodsGrouped);
router.get("/user/:idUser", getUserFoods);
router.get("/available/:idUser", getAvailableFoodsForUser);
router.post("/user/:idUser", addFoodsToUser);
router.delete("/user/:idUser/:foodId", removeFoodFromUser);

export default router;