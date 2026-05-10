import { analyzeFoodImage } from "../services/geminiService.js";
import pool from "../db/connection.js";

/* =========================
   HELPERS
========================= */
const normalizeMealType = (value) =>
  String(value || "").trim().toLowerCase();

const formatMealTypeLabel = (value) => {
  const v = normalizeMealType(value);

  if (v === "desayuno") return "Desayuno";
  if (v === "almuerzo") return "Almuerzo";
  if (v === "cena") return "Cena";
  if (v === "snack") return "Snack";

  return "Otro";
};

const getActiveUserStats = async (id_user) => {
  const [rows] = await pool.query(
    `
    SELECT * FROM user_stats
    WHERE id_user = ? AND status = 'active'
    ORDER BY changed_date DESC
    LIMIT 1
  `,
    [id_user]
  );
  return rows[0];
};

const getInProgressGoal = async (id_user) => {
  const [rows] = await pool.query(
    `
    SELECT * FROM goals
    WHERE id_user = ? AND status = 'inprogress'
    LIMIT 1
  `,
    [id_user]
  );
  return rows[0];
};

const getActiveIntensity = async (id_user) => {
  const [rows] = await pool.query(
    `
    SELECT i.*
    FROM intensity_history ih
    JOIN intensity i ON i.id = ih.intensity_id
    WHERE ih.users_id = ? AND ih.status = 'active'
    LIMIT 1
  `,
    [id_user]
  );
  return rows[0];
};

const getTodayDailyLog = async (id_user) => {
  const [rows] = await pool.query(
    `
    SELECT * FROM daily_logs
    WHERE id_user = ? AND DATE(log_date) = CURDATE()
    LIMIT 1
  `,
    [id_user]
  );
  return rows[0];
};

const getAllFoods = async () => {
  const [rows] = await pool.query(`SELECT * FROM foods`);
  return rows;
};

const insertFood = async (food) => {
  const [result] = await pool.query(
    `
    INSERT INTO foods (name, category, unit_measure, calories, proteins, fats, carbs)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      food.name,
      food.category,
      food.unit_measure,
      food.calories,
      food.proteins,
      food.fats,
      food.carbs,
    ]
  );

  return result.insertId;
};

const insertIaDetection = async (data) => {
  const [result] = await pool.query(
    `
    INSERT INTO ia_detection
    (id_daily_log, ai_prompt, estimated_calories, estimated_proteins, estimated_carbs, estimated_fats, response, type, meal_type, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      data.id_daily_log,
      data.ai_prompt,
      data.estimated_calories,
      data.estimated_proteins,
      data.estimated_carbs,
      data.estimated_fats,
      data.response,
      data.type,
      data.meal_type,
      data.comments,
    ]
  );

  return result.insertId;
};

const insertFoodDetected = async (data) => {
  await pool.query(
    `
    INSERT INTO food_detected (foods_id, ia_detection_id, quantity)
    VALUES (?, ?, ?)
  `,
    [data.foods_id, data.ia_detection_id, data.quantity]
  );
};

const updateDailyLogMacros = async (id, data) => {
  await pool.query(
    `
    UPDATE daily_logs
    SET food_kcal = ?, proteins = ?, carbohydrates = ?, fats = ?, net_kcal = ?
    WHERE id = ?
  `,
    [
      data.food_kcal,
      data.proteins,
      data.carbohydrates,
      data.fats,
      data.net_kcal,
      id,
    ]
  );
};

const buildGroupedHistory = (rows) => {
  const detectionsMap = new Map();

  for (const row of rows) {
    if (!detectionsMap.has(row.detection_id)) {
      detectionsMap.set(row.detection_id, {
        id: row.detection_id,
        created_at: row.created_at,
        log_date: row.log_date,
        type: normalizeMealType(row.type),
        meal_type: normalizeMealType(row.meal_type || row.type),
        meal_label: formatMealTypeLabel(row.meal_type || row.type),
        comments: row.comments || "",
        response: row.response || null,
        totals: {
          calories: Number(row.estimated_calories || 0),
          proteins: Number(row.estimated_proteins || 0),
          carbs: Number(row.estimated_carbs || 0),
          fats: Number(row.estimated_fats || 0),
        },
        foods: [],
      });
    }

    if (row.food_id) {
      detectionsMap.get(row.detection_id).foods.push({
        id: row.food_id,
        food_detected_id: row.food_detected_id,
        name: row.food_name,
        category: row.category,
        unit_measure: row.unit_measure,
        quantity: row.quantity,
        calories: row.food_calories,
        proteins: row.food_proteins,
        carbs: row.food_carbs,
        fats: row.food_fats,
      });
    }
  }

  const groupedByDate = new Map();

  for (const detection of detectionsMap.values()) {
    const dateKey = String(detection.log_date).slice(0, 10);

    if (!groupedByDate.has(dateKey)) {
      groupedByDate.set(dateKey, []);
    }

    groupedByDate.get(dateKey).push(detection);
  }

  return Array.from(groupedByDate.entries()).map(([date, items]) => ({
    title: date,
    data: items,
  }));
};

/* =========================
   ANALYZE + SAVE
========================= */
export const processFoodScan = async (req, res) => {
  try {
    const { id_user, imageBase64, mimeType, type } = req.body;

    if (!id_user || !imageBase64 || !mimeType || !type) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos obligatorios",
      });
    }

    const mealType = normalizeMealType(type);

    const stats = await getActiveUserStats(id_user);
    const goal = await getInProgressGoal(id_user);
    const intensity = await getActiveIntensity(id_user);
    const dailyLog = await getTodayDailyLog(id_user);
    const allFoods = await getAllFoods();

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: "No existe user_stats activo para el usuario",
      });
    }

    if (!dailyLog) {
      return res.status(404).json({
        success: false,
        message: "No existe daily_log para hoy",
      });
    }

    const userContext = {
      weight: stats.weight,
      height: stats.height,
      targetWeight: goal ? goal.target_weight : "Mantener",
      goalType: goal ? goal.goal_type : "Mantener",
      pal: intensity ? intensity.PAL : 1.2,
      intensityName: intensity ? intensity.name : "Sedentario",
      mealType,
    };

    const aiResponse = await analyzeFoodImage(
      imageBase64,
      mimeType,
      userContext,
      allFoods.map((f) => ({ id: f.id, name: f.name }))
    );

    const detectedFoods = Array.isArray(aiResponse.detected_foods)
      ? aiResponse.detected_foods
      : [];

    const finalFoods = [];

    for (const food of detectedFoods) {
      let foodId = food.id;

      if (food.is_new || !foodId) {
        foodId = await insertFood({
          name: food.name,
          category: food.category,
          unit_measure: food.unit_measure,
          calories: food.calories,
          proteins: food.proteins,
          fats: food.fats,
          carbs: food.carbs,
        });
      }

      finalFoods.push({ ...food, id: foodId });
    }

    const detectionId = await insertIaDetection({
      id_daily_log: dailyLog.id,
      ai_prompt: "Visión Gemini Análisis de Comida",
      estimated_calories: aiResponse.totals?.calories || 0,
      estimated_proteins: aiResponse.totals?.proteins || 0,
      estimated_carbs: aiResponse.totals?.carbs || 0,
      estimated_fats: aiResponse.totals?.fats || 0,
      response: JSON.stringify(aiResponse),
      type: mealType,
      meal_type: mealType,
      comments: aiResponse.comment || "",
    });

    for (const food of finalFoods) {
      await insertFoodDetected({
        foods_id: food.id,
        ia_detection_id: detectionId,
        quantity: food.quantity || 1,
      });
    }

    await updateDailyLogMacros(dailyLog.id, {
      food_kcal:
        Number(dailyLog.food_kcal || 0) +
        Number(aiResponse.totals?.calories || 0),
      proteins:
        Number(dailyLog.proteins || 0) +
        Number(aiResponse.totals?.proteins || 0),
      carbohydrates:
        Number(dailyLog.carbohydrates || 0) +
        Number(aiResponse.totals?.carbs || 0),
      fats:
        Number(dailyLog.fats || 0) + Number(aiResponse.totals?.fats || 0),
      net_kcal:
        Number(dailyLog.net_kcal || 0) +
        Number(aiResponse.totals?.calories || 0),
    });

    return res.status(200).json({
      success: true,
      message: "Comida analizada y registrada exitosamente",
      data: aiResponse,
    });
  } catch (error) {
    console.error("Error en processFoodScan:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   HISTORY
========================= */
export const getFoodScanHistory = async (req, res) => {
  try {
    const id_user = Number(req.params.id_user);

    if (!Number.isFinite(id_user) || id_user <= 0) {
      return res.status(400).json({
        success: false,
        message: "id_user requerido",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        fd.id AS food_detected_id,
        fd.foods_id,
        fd.ia_detection_id,
        fd.quantity,
        ia.id AS detection_id,
        ia.id_daily_log,
        ia.meal_type,
        ia.type,
        ia.created_at,
        ia.estimated_calories,
        ia.estimated_proteins,
        ia.estimated_carbs,
        ia.estimated_fats,
        ia.comments,
        ia.response,
        d.log_date,
        f.id AS food_id,
        f.name AS food_name,
        f.category,
        f.unit_measure,
        f.calories AS food_calories,
        f.proteins AS food_proteins,
        f.carbs AS food_carbs,
        f.fats AS food_fats
      FROM daily_logs d
      INNER JOIN ia_detection ia ON ia.id_daily_log = d.id
      LEFT JOIN food_detected fd ON fd.ia_detection_id = ia.id
      LEFT JOIN foods f ON f.id = fd.foods_id
      WHERE d.id_user = ? AND ia.status = 'active'
      ORDER BY d.log_date DESC, ia.created_at DESC, ia.id DESC, fd.id DESC
    `,
      [id_user]
    );

    const grouped = buildGroupedHistory(rows);

    return res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error("getFoodScanHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Error cargando historial",
    });
  }
};

export const getFoodScanDetail = async (req, res) => {
  try {
    const detectionId = Number(req.params.detectionId);

    if (!Number.isFinite(detectionId) || detectionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "detectionId requerido",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        ia.id AS detection_id,
        ia.id_daily_log,
        ia.created_at,
        ia.type,
        ia.meal_type,
        ia.comments,
        ia.response,
        ia.estimated_calories,
        ia.estimated_proteins,
        ia.estimated_carbs,
        ia.estimated_fats,
        d.log_date,
        f.id AS food_id,
        f.name AS food_name,
        f.category,
        f.unit_measure,
        f.calories AS food_calories,
        f.proteins AS food_proteins,
        f.carbs AS food_carbs,
        f.fats AS food_fats,
        fd.id AS food_detected_id,
        fd.quantity
      FROM ia_detection ia
      INNER JOIN daily_logs d ON d.id = ia.id_daily_log
      LEFT JOIN food_detected fd ON fd.ia_detection_id = ia.id
      LEFT JOIN foods f ON f.id = fd.foods_id
      WHERE ia.id = ? AND ia.status = 'active'
      ORDER BY fd.id DESC
    `,
      [detectionId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No encontrado",
      });
    }

    const first = rows[0];

    const foods = rows
      .filter((r) => r.food_id)
      .map((r) => ({
        id: r.food_id,
        food_detected_id: r.food_detected_id,
        name: r.food_name,
        category: r.category,
        unit_measure: r.unit_measure,
        quantity: r.quantity,
        calories: r.food_calories,
        proteins: r.food_proteins,
        carbs: r.food_carbs,
        fats: r.food_fats,
      }));

    return res.json({
      success: true,
      data: {
        id: first.detection_id,
        id_daily_log: first.id_daily_log,
        created_at: first.created_at,
        log_date: first.log_date,
        type: normalizeMealType(first.type),
        meal_type: normalizeMealType(first.meal_type || first.type),
        meal_label: formatMealTypeLabel(first.meal_type || first.type),
        comments: first.comments || "",
        response: first.response || null,
        totals: {
          calories: Number(first.estimated_calories || 0),
          proteins: Number(first.estimated_proteins || 0),
          carbs: Number(first.estimated_carbs || 0),
          fats: Number(first.estimated_fats || 0),
        },
        foods,
      },
    });
  } catch (error) {
    console.error("getFoodScanDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "Error cargando detalle",
    });
  }
};


export const deactivateIaDetection = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const detectionId = Number(req.params.detectionId);

    if (!Number.isFinite(detectionId) || detectionId <= 0) {
      return res.status(400).json({ message: "ID de detección inválido" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [detectionRows] = await connection.query(
      `
      SELECT
        id,
        id_daily_log,
        estimated_calories,
        estimated_proteins,
        estimated_carbs,
        estimated_fats,
        status
      FROM ia_detection
      WHERE id = ?
      LIMIT 1
      `,
      [detectionId]
    );

    if (detectionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    const detection = detectionRows[0];

    if (String(detection.status || "").toLowerCase() !== "active") {
      await connection.rollback();
      return res.status(404).json({ message: "Registro no encontrado o ya está inactivo" });
    }

    await connection.query(
      `
      UPDATE ia_detection
      SET status = 'inactive'
      WHERE id = ? AND status = 'active'
      `,
      [detectionId]
    );

    const calories = Number(detection.estimated_calories || 0);
    const proteins = Number(detection.estimated_proteins || 0);
    const carbs = Number(detection.estimated_carbs || 0);
    const fats = Number(detection.estimated_fats || 0);

    await connection.query(
      `
      UPDATE daily_logs
      SET
        food_kcal = GREATEST(0, COALESCE(food_kcal, 0) - ?),
        proteins = GREATEST(0, COALESCE(proteins, 0) - ?),
        carbohydrates = GREATEST(0, COALESCE(carbohydrates, 0) - ?),
        fats = GREATEST(0, COALESCE(fats, 0) - ?),
        net_kcal = GREATEST(
          0,
          COALESCE(daily_kcal_objective, 0) - (
            GREATEST(0, COALESCE(food_kcal, 0) - ?) 
          )
        )
      WHERE id = ?
      `,
      [calories, proteins, carbs, fats, calories, detection.id_daily_log]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({ message: "Registro desactivado correctamente" });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("deactivateIaDetection error:", error);
    return res.status(500).json({ message: "Error eliminando el registro" });
  } finally {
    connection.release();
  }
};