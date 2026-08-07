const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
    console.log("Redis connected");
  }
}

module.exports = {
  redis,
  connectRedis,
};