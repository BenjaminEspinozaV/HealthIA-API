// controllers/adminAnalyticsController.js
import pool from "../db/connection.js";

export const getAdminAnalyticsRaw = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT id, name, email, role, status, gender, birthday, registered_at, activated_at
      FROM users
      ORDER BY id DESC
    `);

    const [userStats] = await pool.query(`
      SELECT id, id_user, weight, height, changed_date, record_date, status
      FROM user_stats
      ORDER BY id DESC
    `);

    const [goals] = await pool.query(`
      SELECT id, id_user, target_weight, goal_type, goal_value, start_date, end_date, status
      FROM goals
      ORDER BY id DESC
    `);

    const [intensityHistory] = await pool.query(`
      SELECT
        ih.id,
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
      ORDER BY ih.id DESC
    `);

    const [dailyLogs] = await pool.query(`
      SELECT
        id,
        id_user,
        log_date,
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
        water_target_ml,
        record_date
      FROM daily_logs
      ORDER BY log_date DESC, id DESC
    `);

    const [foods] = await pool.query(`
      SELECT id, name, category, unit_measure, calories, proteins, fats, carbs
      FROM foods
      ORDER BY category ASC, name ASC
    `);

    const [foodDetected] = await pool.query(`
      SELECT
        fd.id AS food_detected_id,
        fd.foods_id,
        fd.ia_detection_id,
        fd.quantity,
        f.name AS food_name,
        f.category,
        f.unit_measure,
        f.calories,
        f.proteins,
        f.fats,
        f.carbs,
        ia.id AS ia_id,
        ia.id_daily_log,
        ia.meal_type,
        ia.created_at,
        ia.estimated_calories,
        ia.estimated_proteins,
        ia.estimated_carbs,
        ia.estimated_fats,
  
        ia.response,
        dl.log_date,
        dl.id_user
      FROM food_detected fd
      INNER JOIN foods f ON f.id = fd.foods_id
      INNER JOIN ia_detection ia ON ia.id = fd.ia_detection_id
      INNER JOIN daily_logs dl ON dl.id = ia.id_daily_log
      ORDER BY dl.log_date DESC, fd.id DESC
    `);

    return res.json({
      users,
      userStats,
      goals,
      intensityHistory,
      dailyLogs,
      foods,
      foodDetected,
    });
  } catch (error) {
    console.error("getAdminAnalyticsRaw error:", error);
    return res.status(500).json({
      message: "Error cargando analítica admin",
      error: String(error?.message || error),
    });
  }
};
