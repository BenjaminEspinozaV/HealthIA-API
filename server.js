import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import foodRoutes from "./routes/food.js";
import mealRoutes from "./routes/meals.js";
import ingredientRoutes from "./routes/ingredients.js";
import dailyRoutes from "./routes/dailylog.js";
import exerciseRoutes from "./routes/exercise.js";
import photoMealRoutes from "./routes/photomeal.js";
import analysisRoutes from "./routes/analysis.js";
import statsRoutes from "./routes/stats.js";
import objectiveRoutes from "./routes/objective.js";
import activityRoutes from "./routes/activity.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.get("/", (req, res) => {
  res.json({ message: "HealthAI API running" });
});
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/food", foodRoutes);
app.use("/meals", mealRoutes);
app.use("/ingredients", ingredientRoutes);
app.use("/dailylog", dailyRoutes);
app.use("/exercise", exerciseRoutes);
app.use("/photomeal", photoMealRoutes);
app.use("/analysis", analysisRoutes);
app.use("/stats", statsRoutes);
app.use("/objective", objectiveRoutes);
app.use("/activity", activityRoutes);
app.use((err, req, res, next) => {
  console.error("ERROR GLOBAL:", err);
  res.status(500).json({
    message: "Error interno del servidor",
  });
});
app.listen(3000, () => {
  console.log("Server running on port 3000");
});