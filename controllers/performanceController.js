import pool from "../db/connection.js";

const normalizeId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const getPerformanceRaw = async (req, res) => {
  try {
    const userId = normalizeId(req.params.idUser);

    if (!userId) {
      return res.status(400).json({ message: "idUser es requerido" });
    }

    const [userRows] = await pool.query(
      `SELECT id, name, email, role, status, gender, birthday, registered_at, activated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const [statsHistory] = await pool.query(
      `SELECT id, id_user, weight, height, changed_date, record_date, status
       FROM user_stats
       WHERE id_user = ?
       ORDER BY record_date ASC, id ASC`,
      [userId]
    );

    const currentStats =
      [...statsHistory]
        .reverse()
        .find((row) => String(row.status || "").toLowerCase() === "active") ||
      statsHistory[statsHistory.length - 1] ||
      null;

    const [goalHistory] = await pool.query(
      `SELECT id, id_user, target_weight, goal_type, goal_value, start_date, end_date, status
       FROM goals
       WHERE id_user = ?
       ORDER BY start_date ASC, id ASC`,
      [userId]
    );

    const currentGoal =
      [...goalHistory]
        .reverse()
        .find((row) => String(row.status || "").toLowerCase() === "inprogress") ||
      goalHistory[goalHistory.length - 1] ||
      null;

    const [intensityHistory] = await pool.query(
      `SELECT
         ih.id AS history_id,
         ih.intensity_id,
         ih.users_id,
         ih.start_date,
         ih.end_date,
         ih.status,
         i.name,
         i.description,
         i.PAL
       FROM intensity_history ih
       INNER JOIN intensity i ON i.id = ih.intensity_id
       WHERE ih.users_id = ?
       ORDER BY ih.start_date ASC, ih.id ASC`,
      [userId]
    );

    const activeIntensity =
      [...intensityHistory]
        .reverse()
        .find((row) => String(row.status || "").toLowerCase() === "active") ||
      intensityHistory[intensityHistory.length - 1] ||
      null;

    const [dailyLogs] = await pool.query(
      `SELECT
         id,
         id_user,
         log_date,
         record_date,
         net_kcal,
         daily_kcal_objective,
         food_kcal,
         proteins,
         carbohydrates,
         fats,
         protein_objective,
         carb_target,
         fat_target,
         water_ml,
         water_target_ml
       FROM daily_logs
       WHERE id_user = ?
       ORDER BY log_date ASC, id ASC`,
      [userId]
    );

    const [userFoods] = await pool.query(
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

    return res.json({
      user: userRows[0],
      currentStats,
      statsHistory,
      currentGoal,
      goalHistory,
      activeIntensity,
      intensityHistory,
      dailyLogs,
      userFoods,
    });
  } catch (error) {
    console.error("getPerformanceRaw error:", error);
    return res.status(500).json({ message: "Error cargando rendimiento" });
  }
};