
import pool from "../db/connection.js";

export const getObjective = async(req,res)=>{
 const {userId}=req.params;
 const [rows]=await pool.query(
  "SELECT * FROM objective WHERE idUser=?",
  [userId]
 );
 res.json(rows);
};
