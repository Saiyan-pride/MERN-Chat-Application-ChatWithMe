const mongoose = require("mongoose");

const aiUsageSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    date: {
      type: String, // Format: "YYYY-MM-DD" in UTC
      required: true,
      index: true,
    },
    counts: {
      assistant: { type: Number, default: 0 },
      smartReply: { type: Number, default: 0 },
      summarize: { type: Number, default: 0 },
      polish: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    recentRequests: {
      type: [Date],
      default: [],
    },
  },
  { timestamps: true }
);

// Compound unique index ensuring one document per user per UTC day
aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

const AiUsage = mongoose.model("AiUsage", aiUsageSchema);
module.exports = AiUsage;
