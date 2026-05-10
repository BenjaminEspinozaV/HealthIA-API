import pool from "../db/connection.js";



export const getIntensityLevels = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, description, PAL FROM intensity ORDER BY id ASC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getIntensityById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT id, name, description, PAL FROM intensity WHERE id = ? LIMIT 1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Intensidad no encontrada" });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};