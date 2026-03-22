
import express from "express";
import {addPhotoMeal} from "../controllers/photoMealController.js";
const router = express.Router();

router.post("/",addPhotoMeal);

export default router;
