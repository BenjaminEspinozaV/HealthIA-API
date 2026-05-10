import pool from "../db/connection.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const normalizeDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 10) : null;
};

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const allowedGoalStatuses = new Set(["inprogress", "changed", "done"]);

const KCAL_PER_KG = 7700;

const getTodayDateString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const calculateAgeFromBirthday = (birthday) => {
  if (!birthday) return 25;

  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return 25;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return Math.max(1, age);
};

const calculateBmr = ({ weight, height, age = 25, gender = "M" }) => {
  const w = Number(weight);
  const h = Number(height);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 0;
  }

  const g = String(gender || "M").toUpperCase();

  const base =
    g === "F"
      ? 10 * w + 6.25 * h - 5 * age - 161
      : 10 * w + 6.25 * h - 5 * age + 5;

  return Math.round(base);
};

const calculateDailyObjective = ({
  weight,
  height,
  pal,
  age,
  gender,
  goalTargetWeight,
  goalEndDate,
}) => {
  const bmr = calculateBmr({ weight, height, age, gender });
  const tmr = bmr;
  const burnedKcal = Math.round(tmr * (Number(pal) || 1.2));

  let adjustment = 0;

  if (
    goalTargetWeight !== null &&
    goalTargetWeight !== undefined &&
    goalEndDate
  ) {
    const today = new Date();
    const end = new Date(goalEndDate);

    const daysRemaining = Math.max(
      1,
      Math.ceil((end.getTime() - today.getTime()) / 86400000)
    );

    const diffKg = Number(goalTargetWeight) - Number(weight);
    adjustment = Math.round((diffKg * KCAL_PER_KG) / daysRemaining);
  }

  const objective = Math.max(1200, Math.round(burnedKcal + adjustment));

  return { bmr, tmr, burnedKcal, objective };
};

const calculateMacroTargets = (weight, objective) => {
  const safeWeight = Math.max(1, Number(weight) || 1);
  const safeObjective = Math.max(1, Number(objective) || 1);

  return {
    proteins: Math.max(60, Math.round(safeWeight * 1.8)),
    carbohydrates: Math.max(100, Math.round((safeObjective * 0.45) / 4)),
    fats: Math.max(35, Math.round((safeObjective * 0.3) / 9)),
    water_ml: 2500,
  };
};

const mealTypeFromText = (text) => {
  const value = String(text || "").toLowerCase();

  if (
    value.includes("desayuno") ||
    value.includes("breakfast") ||
    value.includes("morning") ||
    value.includes("avena") ||
    value.includes("yogur") ||
    value.includes("huevo") ||
    value.includes("pan") ||
    value.includes("fruta")
  ) {
    return "desayuno";
  }

  if (
    value.includes("almuerzo") ||
    value.includes("lunch") ||
    value.includes("comida") ||
    value.includes("arroz") ||
    value.includes("pollo") ||
    value.includes("carne") ||
    value.includes("pasta")
  ) {
    return "almuerzo";
  }

  if (
    value.includes("cena") ||
    value.includes("dinner") ||
    value.includes("sopa") ||
    value.includes("ensalada") ||
    value.includes("pescado") ||
    value.includes("ligero")
  ) {
    return "cena";
  }

  return "otro";
};

const mapFood = (food, source = "user") => ({
  id: Number(food.id),
  name: String(food.name || ""),
  category: food.category || "Sin categoría",
  unit_measure: food.unit_measure || null,
  calories: Number(food.calories || 0),
  proteins: Number(food.proteins || 0),
  carbohydrates: Number(food.carbohydrates ?? food.carbs ?? 0),
  fats: Number(food.fats || 0),
  source,
});

const buildMealPlan = (userFoods, remainingKcal) => {
  const foods = (Array.isArray(userFoods) ? userFoods : []).map((f) => ({
    ...mapFood(f),
    mealType: mealTypeFromText(`${f.category || ""} ${f.name || ""}`),
  }));

  const breakfastFoods = foods.filter((f) => f.mealType === "desayuno");
  const lunchFoods = foods.filter((f) => f.mealType === "almuerzo");
  const dinnerFoods = foods.filter((f) => f.mealType === "cena");
  const fallbackFoods = foods.length ? foods : [];

  const safeBudget = Math.max(300, Number(remainingKcal || 0));
  const breakfastBudget = Math.round(safeBudget * 0.25);
  const lunchBudget = Math.round(safeBudget * 0.4);
  const dinnerBudget = Math.max(150, safeBudget - breakfastBudget - lunchBudget);

  const pickTopFoods = (list, budget, count) =>
    [...list]
      .map((food) => {
        const calories = Math.max(1, food.calories || 0);
        const proteinScore = Number(food.proteins || 0) * 4;
        const carbScore = Number(food.carbohydrates || 0) * 1.5;
        const fatScore = Number(food.fats || 0) * 1.2;
        const calorieDistance = Math.abs(calories - budget);

        const score =
          calorieDistance * 2 -
          proteinScore -
          carbScore * 0.25 -
          fatScore * 0.15;

        return { ...food, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map(({ score, ...rest }) => rest);

  return [
    {
      key: "desayuno",
      title: "Desayuno",
      targetKcal: breakfastBudget,
      items: pickTopFoods(
        breakfastFoods.length ? breakfastFoods : fallbackFoods,
        breakfastBudget,
        2
      ),
    },
    {
      key: "almuerzo",
      title: "Almuerzo",
      targetKcal: lunchBudget,
      items: pickTopFoods(
        lunchFoods.length ? lunchFoods : fallbackFoods,
        lunchBudget,
        3
      ),
    },
    {
      key: "cena",
      title: "Cena",
      targetKcal: dinnerBudget,
      items: pickTopFoods(
        dinnerFoods.length ? dinnerFoods : fallbackFoods,
        dinnerBudget,
        2
      ),
    },
  ];
};

const getOrCreateTodayDailyLog = async ({
  userId,
  objective,
  macroTargets,
  foodKcal = 0,
  burnedKcal = 0,
}) => {
  const todayDate = getTodayDateString();
  const netKcal = Number(foodKcal || 0) - Number(burnedKcal || 0);

  const [existingRows] = await pool.query(
    `SELECT id, id_user, log_date, net_kcal, daily_kcal_objective, food_kcal,
            proteins, carbohydrates, fats, protein_objective, carb_target,
            fat_target, water_ml, water_target_ml, record_date
     FROM daily_logs
     WHERE id_user = ? AND log_date = ?
     LIMIT 1`,
    [userId, todayDate]
  );

  if (existingRows.length > 0) {
    await pool.query(
      `UPDATE daily_logs
       SET net_kcal = ?,
           daily_kcal_objective = ?,
           protein_objective = ?,
           carb_target = ?,
           fat_target = ?,
           water_target_ml = ?
       WHERE id = ?`,
      [
        netKcal,
        objective,
        macroTargets.proteins,
        macroTargets.carbohydrates,
        macroTargets.fats,
        macroTargets.water_ml,
        existingRows[0].id,
      ]
    );

    return {
      ...existingRows[0],
      net_kcal: netKcal,
      daily_kcal_objective: objective,
      protein_objective: macroTargets.proteins,
      carb_target: macroTargets.carbohydrates,
      fat_target: macroTargets.fats,
      water_target_ml: macroTargets.water_ml,
    };
  }

  await pool.query(
    `INSERT INTO daily_logs
      (id_user, log_date, net_kcal, daily_kcal_objective, food_kcal,
       proteins, carbohydrates, fats, protein_objective, carb_target,
       fat_target, water_ml, water_target_ml)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 0, ?)`,
    [
      userId,
      todayDate,
      netKcal,
      objective,
      Number(foodKcal || 0),
      macroTargets.proteins,
      macroTargets.carbohydrates,
      macroTargets.fats,
      macroTargets.water_ml,
    ]
  );

  return {
    id: null,
    id_user: userId,
    log_date: todayDate,
    net_kcal: netKcal,
    daily_kcal_objective: objective,
    food_kcal: Number(foodKcal || 0),
    proteins: 0,
    carbohydrates: 0,
    fats: 0,
    protein_objective: macroTargets.proteins,
    carb_target: macroTargets.carbohydrates,
    fat_target: macroTargets.fats,
    water_ml: 0,
    water_target_ml: macroTargets.water_ml,
    record_date: new Date(),
  };
};

const formatMealTypeLabel = (value) => {
  const v = String(value || "").toLowerCase();

  if (v === "desayuno") return "Desayuno";
  if (v === "almuerzo") return "Almuerzo";
  if (v === "cena") return "Cena";
  if (v === "snack") return "Snack";

  return "Otro";
};

const getDetectedFoodsForToday = async (userId) => {
  const todayDate = getTodayDateString();

const [rows] = await pool.query(
  `SELECT
     fd.id AS food_detected_id,
     fd.foods_id,
     fd.ia_detection_id,
     fd.quantity,
     ia.id AS ia_id,
     ia.id_daily_log,
     ia.created_at,
     ia.ai_prompt,
     ia.estimated_calories,
     ia.estimated_proteins,
     ia.estimated_carbs,
     ia.estimated_fats,
     ia.response,
     ia.type,
     ia.comments,
     ia.meal_type,
     ia.status,
     f.name,
     f.category,
     f.unit_measure,
     f.calories,
     f.proteins,
     f.carbs AS carbohydrates,
     f.fats
   FROM daily_logs dl
   INNER JOIN ia_detection ia ON ia.id_daily_log = dl.id
   LEFT JOIN food_detected fd ON fd.ia_detection_id = ia.id
   LEFT JOIN foods f ON f.id = fd.foods_id
   WHERE dl.id_user = ? 
     AND dl.log_date = ? 
     AND ia.status = 'active'
   ORDER BY ia.created_at DESC, fd.id DESC`,
  [userId, todayDate]
);

  const detectionsMap = new Map();

  for (const row of rows) {
    if (!detectionsMap.has(row.ia_id)) {
      detectionsMap.set(row.ia_id, {
        id: row.ia_id,
        id_daily_log: row.id_daily_log,
        created_at: row.created_at,
        meal_type: row.meal_type || row.type || "otro",
        meal_label: formatMealTypeLabel(row.meal_type || row.type || "otro"),
        comments: row.comments || "",
        response: row.response ? row.response : null,
        totals: {
          calories: Number(row.estimated_calories || 0),
          proteins: Number(row.estimated_proteins || 0),
          carbs: Number(row.estimated_carbs || 0),
          fats: Number(row.estimated_fats || 0),
        },
        foods: [],
      });
    }

    if (row.foods_id) {
      detectionsMap.get(row.ia_id).foods.push({
        id: row.foods_id,
        food_detected_id: row.food_detected_id,
        name: row.name,
        category: row.category,
        unit_measure: row.unit_measure,
        quantity: row.quantity,
        calories: row.calories,
        proteins: row.proteins,
        carbs: row.carbohydrates,
        fats: row.fats,
      });
    }
  }

  const grouped = new Map();

  for (const detection of detectionsMap.values()) {
    const key = detection.meal_type || "otro";

    if (!grouped.has(key)) {
      grouped.set(key, {
        meal_type: key,
        meal_label: formatMealTypeLabel(key),
        items: [],
      });
    }

    grouped.get(key).items.push(detection);
  }

  return Array.from(grouped.values());
};

const loadUserFoods = async (userId) => {
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

  return rows.map((food) => mapFood(food));
};

export const getDashboardRaw = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

    if (!Number.isFinite(userId) || userId <= 0) {
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

    const [statsRows] = await pool.query(
      `SELECT id, id_user, weight, height, changed_date, record_date, status
       FROM user_stats
       WHERE id_user = ?
       ORDER BY status = 'active' DESC, record_date DESC, id DESC`,
      [userId]
    );

    const currentStats =
      statsRows.find((row) => normalizeStatus(row.status) === "active") ||
      statsRows[0] ||
      null;

    const [goalRows] = await pool.query(
      `SELECT id, id_user, target_weight, goal_type, goal_value, start_date, end_date, status
       FROM goals
       WHERE id_user = ?
       ORDER BY start_date DESC, id DESC`,
      [userId]
    );

    const currentGoal =
      goalRows.find((row) => normalizeStatus(row.status) === "inprogress") ||
      goalRows[0] ||
      null;

    const [intensityRows] = await pool.query(
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
       ORDER BY CASE WHEN ih.status = 'active' THEN 0 ELSE 1 END,
                ih.start_date DESC,
                ih.id DESC`,
      [userId]
    );

    const activeIntensity =
      intensityRows.find((row) => normalizeStatus(row.status) === "active") ||
      intensityRows[0] ||
      null;

    const age = calculateAgeFromBirthday(userRows[0].birthday);
    const weight = Number(currentStats?.weight || 0);
    const height = Number(currentStats?.height || 0);
    const pal = Number(activeIntensity?.PAL || 1.2);

    const { bmr, tmr, burnedKcal, objective } = calculateDailyObjective({
      weight,
      height,
      pal,
      age,
      gender: userRows[0].gender || "M",
      goalTargetWeight: currentGoal?.target_weight ?? null,
      goalEndDate: currentGoal?.end_date ?? null,
    });

    const macroTargets = calculateMacroTargets(weight, objective);

    const userFoods = await loadUserFoods(userId);
    const mealPlan = buildMealPlan(userFoods, objective);

    const todayDailyLog = await getOrCreateTodayDailyLog({
      userId,
      objective,
      macroTargets,
      foodKcal: 0,
      burnedKcal,
    });

    const consumedMeals = await getDetectedFoodsForToday(userId);

    return res.json({
      user: userRows[0],
      currentStats,
      statsHistory: statsRows,
      currentGoal,
      goalHistory: goalRows,
      activeIntensity,
      intensityHistory: intensityRows,
      dailyLog: todayDailyLog,
      userFoods,
      mealPlan,
      consumedMeals,
      calculations: {
        age,
        bmr,
        tmr,
        burnedKcal,
        objective,
        macroTargets,
      },
    });
  } catch (error) {
    console.error("getDashboardRaw error:", error);
    return res.status(500).json({ message: "Error cargando dashboard" });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
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

    const [statsRows] = await pool.query(
      `SELECT id, id_user, weight, height, changed_date, record_date, status
       FROM user_stats
       WHERE id_user = ?
       ORDER BY status = 'active' DESC, record_date DESC, id DESC`,
      [userId]
    );

    const currentStats =
      statsRows.find((row) => normalizeStatus(row.status) === "active") ||
      statsRows[0] ||
      null;

    const [goalRows] = await pool.query(
      `SELECT id, id_user, target_weight, goal_type, goal_value, start_date, end_date, status
       FROM goals
       WHERE id_user = ?
       ORDER BY start_date DESC, id DESC`,
      [userId]
    );

    const currentGoal =
      goalRows.find((row) => normalizeStatus(row.status) === "inprogress") ||
      goalRows[0] ||
      null;

    const [intensityRows] = await pool.query(
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
       ORDER BY CASE WHEN ih.status = 'active' THEN 0 ELSE 1 END,
                ih.start_date DESC,
                ih.id DESC`,
      [userId]
    );

    return res.json({
      user: userRows[0],
      currentStats,
      statsHistory: statsRows,
      currentGoal,
      goalHistory: goalRows,
      intensityHistory: intensityRows,
    });
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res.status(500).json({ message: "Error cargando perfil" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);
    const { name, email, gender, birthday } = req.body || {};

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    if (!name || !email) {
      return res.status(400).json({ message: "Nombre y correo son requeridos" });
    }

    await pool.query(
      `UPDATE users
       SET name = ?, email = ?, gender = ?, birthday = ?
       WHERE id = ?`,
      [
        String(name).trim(),
        normalizeEmail(email),
        gender ? String(gender).trim() : null,
        normalizeDate(birthday),
        userId,
      ]
    );

    return res.json({ message: "Perfil actualizado" });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res.status(500).json({ message: "Error actualizando perfil" });
  }
};

export const updateUserStats = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.params.idUser);
    const weight = toNumberOrNull(req.body?.weight);
    const height = toNumberOrNull(req.body?.height);

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    if (!weight || weight <= 0) {
      return res.status(400).json({ message: "Peso inválido" });
    }

    if (!height || height <= 0) {
      return res.status(400).json({ message: "Altura inválida" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query(
      `UPDATE user_stats
       SET status = 'inactive',
           changed_date = NOW()
       WHERE id_user = ? AND status = 'active'`,
      [userId]
    );

    await connection.query(
      `INSERT INTO user_stats
        (id_user, weight, height, changed_date, record_date, status)
       VALUES (?, ?, ?, NOW(), NOW(), 'active')`,
      [userId, weight, height]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({ message: "Stats guardadas correctamente" });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("updateUserStats error:", error);
    return res.status(500).json({ message: "Error guardando stats" });
  } finally {
    connection.release();
  }
};

export const updateUserGoal = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.params.idUser);
    const targetWeight = toNumberOrNull(req.body?.targetWeight);
    const goalDate = normalizeDate(req.body?.goalDate);
    const status = normalizeStatus(req.body?.status) || "inprogress";

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    if (!targetWeight || targetWeight <= 0) {
      return res.status(400).json({ message: "Peso objetivo inválido" });
    }

    if (!goalDate) {
      return res.status(400).json({ message: "Fecha objetivo inválida" });
    }

    if (!allowedGoalStatuses.has(status)) {
      return res.status(400).json({ message: "Estado de objetivo inválido" });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query(
      `UPDATE goals
       SET status = 'changed',
           end_date = NOW()
       WHERE id_user = ? AND status = 'inprogress'`,
      [userId]
    );

    await connection.query(
      `INSERT INTO goals
        (id_user, target_weight, goal_type, goal_value, start_date, end_date, status)
       VALUES (?, ?, 'weight', ?, NOW(), ?, ?)`,
      [userId, targetWeight, targetWeight, goalDate, status]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({ message: "Objetivo guardado correctamente" });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    console.error("updateUserGoal error:", error);
    return res.status(500).json({ message: "Error guardando objetivo" });
  } finally {
    connection.release();
  }
};

export const getDailyLog = async (req, res) => {
  try {
    const userId = Number(req.params.idUser);
    const date = normalizeDate(req.params.date) || getTodayDateString();

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "idUser requerido" });
    }

    const [rows] = await pool.query(
      `SELECT id, id_user, log_date, net_kcal, daily_kcal_objective, food_kcal,
              proteins, carbohydrates, fats, protein_objective,
              carb_target, fat_target, water_ml, water_target_ml, record_date
       FROM daily_logs
       WHERE id_user = ? AND log_date = ?
       LIMIT 1`,
      [userId, date]
    );

    return res.json(rows[0] || null);
  } catch (error) {
    console.error("getDailyLog error:", error);
    return res.status(500).json({ message: "Error cargando daily log" });
  }
};
 
