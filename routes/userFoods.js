import express from "express";
import { saveUserFoods,
    getAvailableFoodsForUser,
         
 } from "../controllers/userFoodsController.js";

const router = express.Router();

router.post("/", saveUserFoods);



export default router;