import pool from "../db/connection.js";

export const getUserIntensityHistory = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

  const [rows] = await pool.query(
  `SELECT 
      ih.id AS history_id,
      ih.intensity_id,
      ih.users_id,
      ih.start_date,
      ih.end_date,
      ih.status,

      i.id AS intensity_id_ref,
      i.name,
      i.description,
      i.PAL

   FROM intensity_history ih
   INNER JOIN intensity i ON i.id = ih.intensity_id

   WHERE ih.users_id = ?

   ORDER BY 
      CASE WHEN ih.status = 'active' THEN 0 ELSE 1 END,
      ih.start_date DESC,
      ih.id DESC`,
  [userId]
);

    return res.json(rows);
  } catch (error) {
    console.error("getUserIntensityHistory error:", error);
    return res.status(500).json({ message: "Error cargando intensidad" });
  }
};

export const setActiveIntensity = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.params.idUser);
    const { intensityId } = req.body || {};

    if (!userId || !intensityId) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query(
      `UPDATE intensity_history
       SET status = 'inactive', end_date = NOW()
       WHERE users_id = ? AND status = 'active'`,
      [userId]
    );

    await connection.query(
      `INSERT INTO intensity_history (intensity_id, users_id, start_date, end_date, status)
       VALUES (?, ?, NOW(), NULL, 'active')`,
      [intensityId, userId]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({ message: "Intensidad actualizada" });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("setActiveIntensity error:", error);
    return res.status(500).json({ message: "Error actualizando intensidad" });
  } finally {
    connection.release();
  }
};