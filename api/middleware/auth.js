function apiKeyAuth(req, res, next) {
  const sentApiKey = req.header("x-api-key");
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({
      error: "Server misconfigured: API_KEY is missing in environment.",
    });
  }

  if (!sentApiKey || sentApiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

module.exports = apiKeyAuth;

