const asyncHandler = require("express-async-handler");
const Chat = require("../models/ChatModel");
const Message = require("../models/MessageModel");
const User = require("../models/UserModel");
const crypto = require("crypto");
const {
  generateSummary,
  generateSmartReplies,
  polishDraft,
  chatWithAi,
} = require("../services/aiService");
const {
  rollbackAiQuota,
  getAiUsageSummary,
} = require("../middleware/aiUsageMiddleware");

const formatUsageResponse = (req, isFallback = false) => {
  if (!req.aiUsage) return undefined;
  return {
    feature: req.aiUsage.feature,
    used: req.aiUsage.used,
    limit: req.aiUsage.limit,
    remaining: req.aiUsage.remaining,
    combinedUsed: req.aiUsage.combinedUsed,
    combinedLimit: req.aiUsage.combinedLimit,
    combinedRemaining: req.aiUsage.combinedRemaining,
    isFallback: Boolean(isFallback || req.aiUsage.isFallback),
    resetsAt: req.aiUsage.resetsAt,
  };
};

const AI_BOT_EMAIL = "ai.assistant@chatwithme.internal";
const AI_BOT_NAME = "AI Assistant";
const AI_BOT_PIC =
  "https://res.cloudinary.com/dtz0urit6/image/upload/q_auto:best,f_jpg/cloudinary-tools-uploads/edkmw7dp2wsw47ir1zkr" ||
  "https://pixabay.com/images/download/x-8203396_1920.jpg";

/**
 * Helper: Find or create the system AI Bot User
 */
const getOrCreateAiBotUser = async () => {
  let bot = await User.findOne({ email: AI_BOT_EMAIL });
  if (!bot) {
    bot = await User.create({
      name: AI_BOT_NAME,
      email: AI_BOT_EMAIL,
      password: crypto.randomBytes(24).toString("hex"),
      pic: AI_BOT_PIC,
      isAdmin: false,
    });
  }
  return bot;
};

/*
 * @desc    Summarize recent chat messages
 * @route   POST /api/ai/summarize
 * @access  Protected
 */
const summarizeChat = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  if (!chatId) {
    res.status(400);
    throw new Error("Chat ID is required for summarization");
  }

  const chat = await Chat.findById(chatId).populate("users", "-password");
  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  // Ensure user is authorized member of this chat
  const isMember = chat.users.some(
    (u) => u._id.toString() === req.user._id.toString(),
  );
  if (!isMember) {
    res.status(403);
    throw new Error("You are not authorized to view or summarize this chat");
  }

  // Fetch up to 35 most recent messages
  const recentMessages = await Message.find({ chat: chatId })
    .sort({ createdAt: -1 })
    .limit(35)
    .populate("sender", "name email pic");

  const chronologicalMessages = recentMessages.reverse();

  const chatTitle = chat.isGroupChat
    ? chat.chatName
    : chat.users.find((u) => u._id.toString() !== req.user._id.toString())
        ?.name || "Chat";

  const summaryResult = await generateSummary(chatTitle, chronologicalMessages);
  const isFallback = Boolean(summaryResult.isFallback);
  if (isFallback && req.aiUsage?.reserved) {
    await rollbackAiQuota(req);
  }

  res.status(200).json({
    success: true,
    summary: {
      overview: summaryResult.overview,
      keyPoints: summaryResult.keyPoints,
      actionItems: summaryResult.actionItems,
    },
    messageCount: chronologicalMessages.length,
    usage: formatUsageResponse(req, isFallback),
  });
});

/*
 * @desc    Generate 3 smart quick reply suggestions
 * @route   POST /api/ai/smart-reply
 * @access  Protected
 */
const getSmartReplies = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  if (!chatId) {
    res.status(400);
    throw new Error("Chat ID is required for smart replies");
  }

  const chat = await Chat.findById(chatId).populate("users", "-password");
  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  const isMember = chat.users.some(
    (u) => u._id.toString() === req.user._id.toString(),
  );
  if (!isMember) {
    res.status(403);
    throw new Error("Unauthorized to access this chat");
  }

  // Fetch last 6 messages
  const recentMessages = await Message.find({ chat: chatId })
    .sort({ createdAt: -1 })
    .limit(6)
    .populate("sender", "name email");

  if (!recentMessages || recentMessages.length === 0) {
    if (req.aiUsage?.reserved) await rollbackAiQuota(req);
    return res.status(200).json({
      success: true,
      replies: [],
      usage: formatUsageResponse(req, true),
    });
  }

  const lastMessage = recentMessages[0];

  // If the user was the sender of the last message, smart replies are not needed
  if (lastMessage.sender?._id?.toString() === req.user._id.toString()) {
    if (req.aiUsage?.reserved) await rollbackAiQuota(req);
    return res.status(200).json({
      success: true,
      replies: [],
      usage: formatUsageResponse(req, true),
    });
  }

  const replyResult = await generateSmartReplies(
    recentMessages.reverse(),
    lastMessage.content,
    lastMessage.sender?.name,
  );

  const replies = Array.isArray(replyResult)
    ? replyResult
    : replyResult?.replies || [];
  const isFallback = Boolean(replyResult?.isFallback);
  if (isFallback && req.aiUsage?.reserved) {
    await rollbackAiQuota(req);
  }

  res.status(200).json({
    success: true,
    replies,
    usage: formatUsageResponse(req, isFallback),
  });
});

/*
 * @desc    Polish message text with selected tone
 * @route   POST /api/ai/polish
 * @access  Protected
 */
const polishMessage = asyncHandler(async (req, res) => {
  const { text, tone } = req.body;
  if (!text || !text.trim()) {
    res.status(400);
    throw new Error("Text is required to polish");
  }

  const allowedTones = ["professional", "friendly", "concise", "grammar"];
  const selectedTone = allowedTones.includes(tone) ? tone : "professional";

  const result = await polishDraft(text, selectedTone);
  const isFallback = Boolean(result.isFallback);
  if (isFallback && req.aiUsage?.reserved) {
    await rollbackAiQuota(req);
  }

  res.status(200).json({
    success: true,
    polishedText: result.polishedText,
    tone: result.tone,
    usage: formatUsageResponse(req, isFallback),
  });
});

/*
 * @desc    Chat with AI Assistant (saves user message & triggers AI response)
 * @route   POST /api/ai/chat
 * @access  Protected
 */
const chatWithAssistant = asyncHandler(async (req, res) => {
  const { chatId, message } = req.body;
  if (!chatId || !message || !message.trim()) {
    res.status(400);
    throw new Error("Chat ID and message are required");
  }

  const botUser = await getOrCreateAiBotUser();

  // Verify chat exists and has botUser
  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  // Pull past messages for context
  const pastMessages = await Message.find({ chat: chatId })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("sender", "name email");

  const formattedHistory = pastMessages.reverse().map((m) => ({
    content: m.content,
    isAi: m.sender?._id?.toString() === botUser._id.toString(),
  }));

  // Generate response from AI service
  const aiResult = await chatWithAi(formattedHistory, message);
  const isFallback = Boolean(aiResult.isFallback);
  if (isFallback && req.aiUsage?.reserved) {
    await rollbackAiQuota(req);
  }

  // Persist AI reply into database
  let botReplyMessage = await Message.create({
    sender: botUser._id,
    content: aiResult.reply,
    chat: chatId,
  });

  botReplyMessage = await botReplyMessage.populate("sender", "name pic email");
  botReplyMessage = await botReplyMessage.populate("chat");
  botReplyMessage = await User.populate(botReplyMessage, {
    path: "chat.users",
    select: "name pic email",
  });

  await Chat.findByIdAndUpdate(chatId, { latestMessage: botReplyMessage });

  res.status(200).json({
    success: true,
    reply: botReplyMessage,
    usage: formatUsageResponse(req, isFallback),
  });
});

/*
 * @desc    Ensure the user has an AI Assistant chat room
 * @route   POST /api/ai/ensure-bot-chat
 * @access  Protected
 */
const ensureBotChat = asyncHandler(async (req, res) => {
  const botUser = await getOrCreateAiBotUser();

  // Check if 1-on-1 chat already exists between user and bot
  let existingChat = await Chat.findOne({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: botUser._id } } },
    ],
  })
    .populate("users", "-password")
    .populate("latestMessage");

  if (existingChat) {
    existingChat = await User.populate(existingChat, {
      path: "latestMessage.sender",
      select: "name pic email",
    });
    return res.status(200).json(existingChat);
  }

  // Create new conversation with welcome message
  const chatData = {
    chatName: "AI Assistant",
    isGroupChat: false,
    users: [req.user._id, botUser._id],
  };

  const createdChat = await Chat.create(chatData);

  // Seed welcome greeting message
  let welcomeMessage = await Message.create({
    sender: botUser._id,
    content:
      "Hello! I am your AI Assistant in ChatWithMe. You can ask me questions, brainstorm ideas, draft emails, or practice conversations right here.",
    chat: createdChat._id,
  });

  await Chat.findByIdAndUpdate(createdChat._id, {
    latestMessage: welcomeMessage._id,
  });

  const fullChat = await Chat.findById(createdChat._id)
    .populate("users", "-password")
    .populate("latestMessage");

  res.status(200).json(fullChat);
});

/*
 * @desc    Get current user daily AI usage & limits
 * @route   GET /api/ai/usage
 * @access  Protected
 */
const getAiUsageStatus = asyncHandler(async (req, res) => {
  const summary = await getAiUsageSummary(req.user._id);
  res.status(200).json({
    success: true,
    ...summary,
  });
});

module.exports = {
  summarizeChat,
  getSmartReplies,
  polishMessage,
  chatWithAssistant,
  ensureBotChat,
  getAiUsageStatus,
};
