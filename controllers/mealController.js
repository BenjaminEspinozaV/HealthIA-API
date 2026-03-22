
import pool from "../db/connection.js";

export const getMeals = async(req,res)=>{
 const [rows]=await pool.query("SELECT * FROM Meal");
 res.json(rows);
};

export const createMeal = async(req,res)=>{
 const {mealName,calories}=req.body;
 const [result]=await pool.query(
   "INSERT INTO Meal (mealName,calories) VALUES (?,?)",
   [mealName,calories]
 );
 res.json({id:result.insertId});
};
