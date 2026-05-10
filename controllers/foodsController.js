import pool from "../db/connection.js";

const normalizeIds = (ids) =>
  Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

export const getFoods = async (req, res) => {
  try {
    const { category } = req.query;

    let query = `
      SELECT
        id,
        name,
        category,
        unit_measure,
        calories,
        proteins,
        carbs AS carbohydrates,
        fats
      FROM foods
    `;

    const params = [];

    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }

    query += " ORDER BY category ASC, name ASC";

    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (error) {
    console.error("getFoods error:", error);
    return res.status(500).json({ message: "Error cargando comidas" });
  }
};

export const getFoodsGrouped = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        name,
        category,
        unit_measure,
        calories,
        proteins,
        carbs AS carbohydrates,
        fats
      FROM foods
      ORDER BY category ASC, name ASC
    `);

    const grouped = rows.reduce((acc, food) => {
      const key = food.category || "Sin categoría";
      if (!acc[key]) acc[key] = [];
      acc[key].push(food);
      return acc;
    }, {});

    return res.json(grouped);
  } catch (error) {
    console.error("getFoodsGrouped error:", error);
    return res.status(500).json({ message: "Error agrupando comidas" });
  }
};

export const getUserFoods = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    const [rows] = await pool.query(
      `SELECT
         f.id,
         f.name,
         f.category,
         f.unit_measure,
         f.calories,
         f.proteins,
         f.carbs AS carbohydrates,
         f.fats
       FROM user_has_foods uf
       INNER JOIN foods f ON f.id = uf.foods_id
       WHERE uf.users_id = ?
       ORDER BY f.category ASC, f.name ASC`,
      [userId]
    );

    return res.json(rows);
  } catch (error) {
    console.error("getUserFoods error:", error);
    return res.status(500).json({ message: "Error cargando comidas del usuario" });
  }
};

export const getAvailableFoodsForUser = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    const [rows] = await pool.query(
      `SELECT
         f.id,
         f.name,
         f.category,
         f.unit_measure,
         f.calories,
         f.proteins,
         f.carbs AS carbohydrates,
         f.fats
       FROM foods f
       WHERE NOT EXISTS (
         SELECT 1
         FROM user_has_foods uf
         WHERE uf.users_id = ? AND uf.foods_id = f.id
       )
       ORDER BY f.category ASC, f.name ASC`,
      [userId]
    );

    return res.json(rows);
  } catch (error) {
    console.error("getAvailableFoodsForUser error:", error);
    return res.status(500).json({ message: "Error cargando comidas disponibles" });
  }
};

export const addFoodsToUser = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.params.idUser);
    const foodsIds = normalizeIds(req.body?.foodsIds);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    if (foodsIds.length === 0) {
      return res.status(400).json({ message: "Debes enviar al menos un alimento" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [currentRows] = await connection.query(
      `SELECT foods_id
       FROM user_has_foods
       WHERE users_id = ?`,
      [userId]
    );

    const currentSet = new Set(currentRows.map((row) => Number(row.foods_id)));
    const idsToInsert = foodsIds.filter((id) => !currentSet.has(id));

    if (idsToInsert.length > 0) {
      const values = idsToInsert.map((foodId) => [userId, foodId]);
      await connection.query(
        `INSERT INTO user_has_foods (users_id, foods_id) VALUES ?`,
        [values]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.json({
      message: "Alimentos agregados",
      added: idsToInsert.length,
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("addFoodsToUser error:", error);
    return res.status(500).json({ message: "Error agregando comidas" });
  } finally {
    connection.release();
  }
};

export const removeFoodFromUser = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);
    const foodId = Number(req.params.foodId);

    if (
      !Number.isFinite(userId) ||
      userId <= 0 ||
      !Number.isFinite(foodId) ||
      foodId <= 0
    ) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    const [result] = await pool.query(
      `DELETE FROM user_has_foods
       WHERE users_id = ? AND foods_id = ?`,
      [userId, foodId]
    );

    return res.json({
      message: "Alimento eliminado",
      affectedRows: result.affectedRows || 0,
    });
  } catch (error) {
    console.error("removeFoodFromUser error:", error);
    return res.status(500).json({ message: "Error eliminando alimento" });
  }
};
