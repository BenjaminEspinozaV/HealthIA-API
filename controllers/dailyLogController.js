import pool from "../db/connection.js";

export const getDailyLog = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser inválido" });
    }

    // 🔹 Traer logs del día actual
    const [rows] = await pool.query(
      `
      SELECT 
        dl.id,
        dl.date,
        dl.total_calories,
        dl.total_proteins,
        dl.total_carbs,
        dl.total_fats
      FROM daily_log dl
      WHERE dl.users_id = ?
      ORDER BY dl.date DESC
      LIMIT 1
      `,
      [userId]
    );

    // 🔹 Si no hay registro aún
    if (rows.length === 0) {
      return res.json({
        message: "Sin registros",
        data: null,
      });
    }

    return res.json({
      message: "Daily log obtenido",
      data: rows[0],
    });

  } catch (error) {
    console.error("getDailyLog error:", error);
    return res.status(500).json({
      message: "Error obteniendo daily log",
    });
  }
};