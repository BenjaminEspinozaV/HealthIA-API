import express from "express";
import cors from "cors";

// ROUTES
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import foodsRoutes from "./routes/foods.js";
import intensityRoutes from "./routes/intensity.js";
import ingredientRoutes from "./routes/ingredients.js";
import dailyRoutes from "./routes/dailylog.js";
 
import photoMealRoutes from "./routes/photomeal.js";
import analysisRoutes from "./routes/analysis.js";
import statsRoutes from "./routes/stats.js";
import objectiveRoutes from "./routes/objective.js";

import userFoodsRoutes from "./routes/userFoods.js";
import dashboardRoutes from "./routes/dashboard.js";
import intensityHistoryRoutes from "./routes/intensityHistory.js";  
import performanceRoutes from "./routes/performance.js";
import adminAnalyticsRoutes from "./routes/adminAnalytics.js";
import scanRoutes from "./routes/scan.js";  
const app = express();

/* =======================
   MIDDLEWARES
======================= */
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

/* =======================
   LOGGER
======================= */
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

/* =======================
   RUTA BASE
======================= */
app.get("/", (req, res) => {
  res.json({ message: "HealthAI API running 🚀" });
});

/* =======================
   ROUTES
======================= */
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
 
app.use("/intensity", intensityRoutes);
app.use("/ingredients", ingredientRoutes);
app.use("/dailylog", dailyRoutes);

app.use("/photomeal", photoMealRoutes);
app.use("/analysis", analysisRoutes);
app.use("/stats", statsRoutes);
app.use("/objective", objectiveRoutes);

app.use("/auth", authRoutes);

app.use("/dashboard", dashboardRoutes);
app.use("/intensity-history", intensityHistoryRoutes);
app.use("/users", userRoutes);
app.use("/foods", foodsRoutes);
app.use("/intensity", intensityRoutes);

app.use("/performance", performanceRoutes);
app.use("/dailylog", dailyRoutes);
app.use("/admin-analytics", adminAnalyticsRoutes);
app.use("/scan", scanRoutes);
/* =======================
   ERROR GLOBAL
======================= */
app.use((err, req, res, next) => {
  console.error("ERROR GLOBAL:", err);
  res.status(500).json({
    message: "Error interno del servidor",
  });
});

/* =======================
   START SERVER
======================= */
const startServer = async () => {
  try {
 

    app.listen(3000, () => {
      console.log("Server running on port 3000 🚀");
    });
  } catch (error) {
    console.error("Error al iniciar servidor:", error);
  }
};

startServer();