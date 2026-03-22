
import pool from "../db/connection.js";

export const addAnalysis = async(req,res)=>{
 const {idPhotoMeal,estimatedCalories}=req.body;
 const [result]=await pool.query(
  "INSERT INTO aimealanalysis (idPhotoMeal,estimatedCalories) VALUES (?,?)",
  [idPhotoMeal,estimatedCalories]
 );
 res.json({id:result.insertId});
};
