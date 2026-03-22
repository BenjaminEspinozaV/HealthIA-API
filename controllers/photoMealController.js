
import pool from "../db/connection.js";

export const addPhotoMeal = async(req,res)=>{
 const {idUser,aiDescription,estimatedCalories}=req.body;
 const [result]=await pool.query(
  "INSERT INTO photomeallog (idUser,aiDescription,estimatedCalories) VALUES (?,?,?)",
  [idUser,aiDescription,estimatedCalories]
 );
 res.json({id:result.insertId});
};
