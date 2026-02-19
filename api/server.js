const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const { execute } = require("./db");
const apiKeyAuth = require("./middleware/auth");
const pegawaiRoutes = require("./routes/pegawai");
const ukpdRoutes = require("./routes/ukpd");

const app = express();
const PORT = Number(process.env.PORT || 3001);

function buildCorsOptions() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    return {};
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked: origin not allowed."));
    },
  };
}

app.use(helmet());
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));
app.use(cors(buildCorsOptions()));
app.use(apiKeyAuth);

app.get("/health", async (req, res, next) => {
  try {
    await execute("SELECT 1 AS ok");
    return res.json({ status: "ok", db: "connected" });
  } catch (err) {
    return next(err);
  }
});

app.use("/pegawai", pegawaiRoutes);
app.use("/ukpd", ukpdRoutes);

app.use((req, res) => {
  return res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`API running on http://127.0.0.1:${PORT}`);
});
