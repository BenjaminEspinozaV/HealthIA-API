import pool from "../db/connection.js";


let activityLevelsEnsured = false;


const ensureActivityLevelsSeeded = async () => {
  if (activityLevelsEnsured) {
    return;
  }

 
  activityLevelsEnsured = true;
};

const toPositiveNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};




export const getUsers = async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM users");
  res.json(rows);
};

export const getUser = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  res.json(rows[0]);
};



export const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
 
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    
    await pool.query(
      `
      UPDATE users 
      SET 
        status = ?, 
        activated_at= IF(? = 'active', NOW(), activated_at)
      WHERE id = ?
      `,
      [status, status, id]
    );

    return res.json({ success: true, id, status });
  } catch (error) {
    console.error("ERROR REAL:", error);  
    return res.status(500).json({
      error: error.message || "Error actualizando estado",
    });
  }
};
export const getUserFoods = async (req, res) => {
  try {
    const { idUser } = req.params;

    const [rows] = await pool.query(`
      SELECT f.*
      FROM foods f
      INNER JOIN user_has_foods uf ON uf.foods_id = f.id
      WHERE uf.users_id = ?
    `, [idUser]);

    res.json(rows);
  } catch (error) {
    console.error("Error getUserFoods:", error);
    res.status(500).json({ message: "Error obteniendo comidas" });
  }
};