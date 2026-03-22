
import express from "express";
import {addIngredient} from "../controllers/ingredientController.js";
const router = express.Router();

router.post("/",addIngredient);

export default router;
