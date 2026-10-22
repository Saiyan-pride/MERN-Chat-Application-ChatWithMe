const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  summarizeChat,
  getSmartReplies,
  polishMessage,
  chatWithAssistant,
  ensureBotChat,
} = require("../controllers/aiControllers");

const router = express.Router();

router.route("/summarize").post(protect, summarizeChat);
router.route("/smart-reply").post(protect, getSmartReplies);
router.route("/polish").post(protect, polishMessage);
router.route("/chat").post(protect, chatWithAssistant);
router.route("/ensure-bot-chat").post(protect, ensureBotChat);

module.exports = router;
