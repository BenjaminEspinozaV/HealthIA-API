
import express from "express";
import {getFood} from "../controllers/foodController.js";
const router = express.Router();

router.get("/",getFood);

export default router;
