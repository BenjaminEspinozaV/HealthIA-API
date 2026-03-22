import pool from "../db/connection.js";

export const saveStats = async (req, res) => {
  try {

    const {
      idUser,
      weight,
      height,
      targetWeight,
      idActivityLevel
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO UserStats 
      (idUser, weight, height, targetWeight, idActivityLevel) 
      VALUES (?, ?, ?, ?, ?)`,
      [idUser, weight, height, targetWeight, idActivityLevel || null]
    );

    res.json({
      message: "Stats guardados",
      id: result.insertId
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error al guardar stats",
      error
    });

  }
};