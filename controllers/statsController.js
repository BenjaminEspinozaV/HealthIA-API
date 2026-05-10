import pool from "../db/connection.js";

export const saveStats = async (req, res) => {
  try {
    const {
      id_user,
      weight,
      height,
      status,
    } = req.body;

    const userId = Number(id_user);
    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "id_user inválido",
      });
    }

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      return res.status(400).json({
        message: "weight inválido",
      });
    }

    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      return res.status(400).json({
        message: "height inválido",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO user_stats 
      (id_user, weight, height, changed_date, record_date, status) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
      [userId, parsedWeight, parsedHeight, status || "active"]
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
