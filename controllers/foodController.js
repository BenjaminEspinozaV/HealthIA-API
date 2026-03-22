
import pool from "../db/connection.js";

export const getFood = async(req,res)=>{
 const [rows]=await pool.query("SELECT * FROM food");
 res.json(rows);
};
