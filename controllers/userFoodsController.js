import pool from "../db/connection.js";

export const saveUserFoods = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const { usersId, foodsIds } = req.body;

    if (!usersId || !Array.isArray(foodsIds)) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    const cleanFoodIds = Array.from(
      new Set(
        foodsIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    if (cleanFoodIds.length === 0) {
      return res.status(400).json({ message: "Debes enviar al menos un alimento" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query("DELETE FROM user_has_foods WHERE users_id = ?", [
      usersId,
    ]);

    const values = cleanFoodIds.map((foodId) => [usersId, foodId]);
    await connection.query(
      "INSERT INTO user_has_foods (users_id, foods_id) VALUES ?",
      [values]
    );

    await connection.commit();
    transactionStarted = false;

    res.status(200).json({ message: "Alimentos actualizados" });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};
export const getAvailableFoodsForUser = async (req, res) => {
  try {
    const { idUser } = req.params;

    const [rows] = await pool.query(`
      SELECT f.*
      FROM foods f
      WHERE f.id NOT IN (
        SELECT foods_id
        FROM user_has_foods
        WHERE users_id = ?
      )
    `, [idUser]);

    res.json(rows);
  } catch (error) {
    console.error("Error getAvailableFoodsForUser:", error);
    res.status(500).json({ message: "Error obteniendo alimentos disponibles" });
  }
};