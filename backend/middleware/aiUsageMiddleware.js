const AiUsage = require("../models/AiUsageModel");

const getLimits = () => ({
  assistant: parseInt(process.env.AI_LIMIT_ASSISTANT_DAILY, 10) || 20,
  smartReply: parseInt(process.env.AI_LIMIT_SMART_REPLY_DAILY, 10) || 15,
  summarize: parseInt(process.env.AI_LIMIT_SUMMARIZE_DAILY, 10) || 5,
  polish: parseInt(process.env.AI_LIMIT_POLISH_DAILY, 10) || 15,
  combined: parseInt(process.env.AI_LIMIT_COMBINED_DAILY, 10) || 30,
  perMinute: parseInt(process.env.AI_LIMIT_PER_MINUTE, 10) || 5,
});

const getUtcDateString = () => new Date().toISOString().split("T")[0];

const getNextUtcMidnight = () => {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return tomorrow.toISOString();
};

const featureLabels = {
  assistant: "AI Assistant",
  smartReply: "Smart Replies",
  summarize: "Conversation Summarizer",
  polish: "Message Polish",
};

/**
 * Middleware factory to check rate limits & reserve quota atomically
 */
const checkAndReserveAiQuota = (featureName) => {
  return async (req, res, next) => {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const limits = getLimits();
    const todayStr = getUtcDateString();
    const resetsAt = getNextUtcMidnight();
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    const now = new Date();

    try {
      // 1. Ensure user usage document exists for today
      await AiUsage.updateOne(
        { user: req.user._id, date: todayStr },
        {
          $setOnInsert: {
            user: req.user._id,
            date: todayStr,
            counts: {
              assistant: 0,
              smartReply: 0,
              summarize: 0,
              polish: 0,
              total: 0,
            },
            recentRequests: [],
          },
        },
        { upsert: true }
      );

      // 2. Sliding 60-second burst rate limit check
      const doc = await AiUsage.findOne({ user: req.user._id, date: todayStr });
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const recentInWindow = (doc?.recentRequests || []).filter(
        (ts) => new Date(ts) > oneMinuteAgo
      );

      if (recentInWindow.length >= limits.perMinute) {
        const oldestInWindow = new Date(recentInWindow[0]).getTime();
        const retryAfter = Math.max(
          1,
          Math.ceil((oldestInWindow + 60000 - now.getTime()) / 1000)
        );
        return res.status(429).json({
          success: false,
          message: `Too many AI requests. Please wait ${retryAfter}s before trying again.`,
          errorType: "RATE_LIMITED",
          limitType: "short_term",
          retryAfter,
          resetsAt,
        });
      }

      // 3. Fallback Mode: API Key missing, run heuristics without consuming daily quota
      if (!hasApiKey) {
        await AiUsage.updateOne(
          { user: req.user._id, date: todayStr },
          {
            $push: {
              recentRequests: {
                $each: [now],
                $slice: -20,
              },
            },
          }
        );

        req.aiUsage = {
          isFallback: true,
          reserved: false,
          feature: featureName,
          used: doc?.counts?.[featureName] || 0,
          limit: limits[featureName],
          remaining: Math.max(0, limits[featureName] - (doc?.counts?.[featureName] || 0)),
          combinedUsed: doc?.counts?.total || 0,
          combinedLimit: limits.combined,
          combinedRemaining: Math.max(0, limits.combined - (doc?.counts?.total || 0)),
          resetsAt,
        };
        return next();
      }

      // 4. Live Mode: Atomic Reservation
      const featureLimit = limits[featureName];
      const combinedLimit = limits.combined;

      const reservedDoc = await AiUsage.findOneAndUpdate(
        {
          user: req.user._id,
          date: todayStr,
          [`counts.${featureName}`]: { $lt: featureLimit },
          "counts.total": { $lt: combinedLimit },
        },
        {
          $inc: {
            [`counts.${featureName}`]: 1,
            "counts.total": 1,
          },
          $push: {
            recentRequests: {
              $each: [now],
              $slice: -20,
            },
          },
        },
        { returnDocument: "after" }
      );

      // Quota exhausted
      if (!reservedDoc) {
        const currentDoc = await AiUsage.findOne({
          user: req.user._id,
          date: todayStr,
        });
        const currentFeatureCount = currentDoc?.counts?.[featureName] || 0;
        const currentTotalCount = currentDoc?.counts?.total || 0;
        const isFeatureLimit = currentFeatureCount >= featureLimit;
        const label = featureLabels[featureName] || featureName;
        const secondsToMidnight = Math.max(
          1,
          Math.ceil((new Date(resetsAt).getTime() - now.getTime()) / 1000)
        );

        return res.status(429).json({
          success: false,
          message: isFeatureLimit
            ? `Daily limit reached for ${label} (${featureLimit}/${featureLimit}). Resets at 00:00 UTC.`
            : `Combined daily AI limit reached (${combinedLimit}/${combinedLimit}). Resets at 00:00 UTC.`,
          errorType: "QUOTA_EXCEEDED",
          limitType: isFeatureLimit ? "feature" : "combined",
          feature: featureName,
          used: isFeatureLimit ? currentFeatureCount : currentTotalCount,
          limit: isFeatureLimit ? featureLimit : combinedLimit,
          resetsAt,
          retryAfter: secondsToMidnight,
        });
      }

      // Reserved successfully
      req.aiUsage = {
        reserved: true,
        feature: featureName,
        userId: req.user._id,
        date: todayStr,
        used: reservedDoc.counts[featureName],
        limit: featureLimit,
        remaining: Math.max(0, featureLimit - reservedDoc.counts[featureName]),
        combinedUsed: reservedDoc.counts.total,
        combinedLimit,
        combinedRemaining: Math.max(0, combinedLimit - reservedDoc.counts.total),
        resetsAt,
        isFallback: false,
      };

      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Rollback quota reservation if downstream provider fails
 */
const rollbackAiQuota = async (req) => {
  if (req?.aiUsage?.reserved && req?.aiUsage?.userId && req?.aiUsage?.date) {
    try {
      await AiUsage.updateOne(
        { user: req.aiUsage.userId, date: req.aiUsage.date },
        {
          $inc: {
            [`counts.${req.aiUsage.feature}`]: -1,
            "counts.total": -1,
          },
        }
      );
      req.aiUsage.reserved = false;
      req.aiUsage.isFallback = true;
      if (typeof req.aiUsage.used === "number") req.aiUsage.used = Math.max(0, req.aiUsage.used - 1);
      if (typeof req.aiUsage.remaining === "number") req.aiUsage.remaining = req.aiUsage.remaining + 1;
      if (typeof req.aiUsage.combinedUsed === "number") req.aiUsage.combinedUsed = Math.max(0, req.aiUsage.combinedUsed - 1);
      if (typeof req.aiUsage.combinedRemaining === "number") req.aiUsage.combinedRemaining = req.aiUsage.combinedRemaining + 1;
    } catch (e) {
      console.error("Failed to rollback AI quota reservation:", e.message);
    }
  }
};

/**
 * Fetch daily summary for GET /api/ai/usage
 */
const getAiUsageSummary = async (userId) => {
  const limits = getLimits();
  const todayStr = getUtcDateString();
  const resetsAt = getNextUtcMidnight();

  const doc = await AiUsage.findOne({ user: userId, date: todayStr });
  const counts = doc?.counts || {
    assistant: 0,
    smartReply: 0,
    summarize: 0,
    polish: 0,
    total: 0,
  };

  return {
    date: todayStr,
    limits: {
      assistant: {
        used: counts.assistant || 0,
        limit: limits.assistant,
        remaining: Math.max(0, limits.assistant - (counts.assistant || 0)),
      },
      smartReply: {
        used: counts.smartReply || 0,
        limit: limits.smartReply,
        remaining: Math.max(0, limits.smartReply - (counts.smartReply || 0)),
      },
      summarize: {
        used: counts.summarize || 0,
        limit: limits.summarize,
        remaining: Math.max(0, limits.summarize - (counts.summarize || 0)),
      },
      polish: {
        used: counts.polish || 0,
        limit: limits.polish,
        remaining: Math.max(0, limits.polish - (counts.polish || 0)),
      },
      combined: {
        used: counts.total || 0,
        limit: limits.combined,
        remaining: Math.max(0, limits.combined - (counts.total || 0)),
      },
    },
    resetsAt,
  };
};

module.exports = {
  getLimits,
  getUtcDateString,
  getNextUtcMidnight,
  checkAndReserveAiQuota,
  rollbackAiQuota,
  getAiUsageSummary,
};
