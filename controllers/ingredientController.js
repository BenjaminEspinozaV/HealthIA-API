
import pool from "../db/connection.js";

export const addIngredient = async(req,res)=>{
 const {idMeal,idFood,quantity}=req.body;
 const [result]=await pool.query(
  "INSERT INTO mealingredients (idMeal,idFood,quantity) VALUES (?,?,?)",
  [idMeal,idFood,quantity]
 );
 res.json({id:result.insertId});
};
