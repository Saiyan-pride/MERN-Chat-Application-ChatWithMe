const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  checkAndReserveAiQuota,
} = require("../middleware/aiUsageMiddleware");
const {
  summarizeChat,
  getSmartReplies,
  polishMessage,
  chatWithAssistant,
  ensureBotChat,
  getAiUsageStatus,
} = require("../controllers/aiControllers");

const router = express.Router();

router.route("/usage").get(protect, getAiUsageStatus);
router
  .route("/summarize")
  .post(protect, checkAndReserveAiQuota("summarize"), summarizeChat);
router
  .route("/smart-reply")
  .post(protect, checkAndReserveAiQuota("smartReply"), getSmartReplies);
router
  .route("/polish")
  .post(protect, checkAndReserveAiQuota("polish"), polishMessage);
router
  .route("/chat")
  .post(protect, checkAndReserveAiQuota("assistant"), chatWithAssistant);
router.route("/ensure-bot-chat").post(protect, ensureBotChat);

module.exports = router;

