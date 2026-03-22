
import pool from "../db/connection.js";

export const getActivity = async(req,res)=>{
 const {userId}=req.params;
 const [rows]=await pool.query(
  "SELECT * FROM useractivityprofile WHERE idUser=?",
  [userId]
 );
 res.json(rows);
};
