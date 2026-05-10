
import pool from "../db/connection.js";

export const addPhotoMeal = async(req,res)=>{
 const {id_user,aiDescription,estimatedCalories}=req.body;
 const [result]=await pool.query(
  "INSERT INTO photomeallog (id_user,aiDescription,estimatedCalories) VALUES (?,?,?)",
  [id_user,aiDescription,estimatedCalories]
 );
 res.json({id:result.insertId});
};
