const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const User = require("../models/UserModel");
const Chat = require("../models/ChatModel");
const Message = require("../models/MessageModel");
const generateToken = require("../config/generateToken");
const {
  summarizeChat,
  getSmartReplies,
  polishMessage,
  chatWithAssistant,
  ensureBotChat,
} = require("../controllers/aiControllers");

const createMockReqRes = (body = {}, user = null) => {
  const req = {
    body,
    user,
    headers: {},
  };
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
    send(data) {
      this.data = data;
      return this;
    },
  };
  return { req, res };
};

const runAsync = async (fn, req, res) => {
  let error = null;
  try {
    await fn(req, res, (err) => {
      if (err) error = err;
    });
  } catch (err) {
    error = err;
  }
  return { req, res, error };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
};

async function runAiTests() {
  console.log("==================================================");
  console.log("Running Phase 2: AI Integration Test Suite");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for AI tests.\n");

  const testUserEmail1 = "ai_test_user1@domain.com";
  const testUserEmail2 = "ai_test_user2@domain.com";

  try {
    // 0. Setup: Clean test users and chats
    await User.deleteMany({ email: { $in: [testUserEmail1, testUserEmail2] } });
    const user1 = await User.create({
      name: "AI Test User 1",
      email: testUserEmail1,
      password: "password123",
    });
    const user2 = await User.create({
      name: "AI Test User 2",
      email: testUserEmail2,
      password: "password123",
    });

    const testChat = await Chat.create({
      chatName: "Sprint Planning",
      isGroupChat: true,
      users: [user1._id, user2._id],
      groupAdmin: user1._id,
    });

    // Seed test messages
    await Message.create({
      sender: user1._id,
      content: "Let's review the new deployment roadmap for this week.",
      chat: testChat._id,
    });
    await Message.create({
      sender: user2._id,
      content: "I have prepared the server migration scripts. Ready when you are.",
      chat: testChat._id,
    });
    await Message.create({
      sender: user1._id,
      content: "Awesome, please schedule the migration for Friday 8 PM.",
      chat: testChat._id,
    });
    await Message.create({
      sender: user2._id,
      content: "Understood, I will notify the ops team today.",
      chat: testChat._id,
    });

    // Test 1: Chat Summarizer Validation
    console.log("\n[Test 1] Conversation Summarizer");
    {
      const { req, res } = createMockReqRes({ chatId: testChat._id }, user1);
      const { error } = await runAsync(summarizeChat, req, res);
      assert(!error && res.statusCode === 200, "Summarize returns 200 OK");
      assert(res.data?.success === true, "Response reports success = true");
      assert(Boolean(res.data?.summary?.overview), "Includes executive overview summary");
      assert(Array.isArray(res.data?.summary?.keyPoints), "Includes array of key points");
      assert(Array.isArray(res.data?.summary?.actionItems), "Includes array of action items");
    }

    // Test 2: Smart Replies Generation
    console.log("\n[Test 2] Contextual Smart Replies");
    {
      // user1 requests smart replies after user2 said "Understood, I will notify..."
      const { req, res } = createMockReqRes({ chatId: testChat._id }, user1);
      const { error } = await runAsync(getSmartReplies, req, res);
      assert(!error && res.statusCode === 200, "Smart replies returns 200 OK");
      assert(Array.isArray(res.data?.replies), "Returns array of replies");
      assert(res.data?.replies?.length > 0, "Provides contextual suggestions");
    }

    // Test 3: Smart Replies not generated if user is the last sender
    console.log("\n[Test 3] Smart Replies Suppression for Self-Messages");
    {
      // user2 requests smart replies when user2 was the last sender
      const { req, res } = createMockReqRes({ chatId: testChat._id }, user2);
      const { error } = await runAsync(getSmartReplies, req, res);
      assert(!error && res.statusCode === 200, "Returns 200 OK");
      assert(res.data?.replies?.length === 0, "Returns empty array when user is the last sender");
    }

    // Test 4: Message Draft Polishing (Tones & Grammar)
    console.log("\n[Test 4] Message Polishing & Tone Adjustment");
    {
      const sampleText = "hey can u pls check the code fast";
      for (const tone of ["professional", "friendly", "concise", "grammar"]) {
        const { req, res } = createMockReqRes({ text: sampleText, tone }, user1);
        const { error } = await runAsync(polishMessage, req, res);
        assert(!error && res.statusCode === 200, `Polishing for tone '${tone}' succeeds with 200 OK`);
        assert(Boolean(res.data?.polishedText), `Returns non-empty polished text for '${tone}'`);
        assert(res.data?.tone === tone, `Returns matching tone identifier '${tone}'`);
      }
    }

    // Test 5: Pinned AI Assistant Bot Chat Creation
    console.log("\n[Test 5] AI Assistant Bot Chat Provisioning");
    let botChatId = null;
    {
      const { req, res } = createMockReqRes({}, user1);
      const { error } = await runAsync(ensureBotChat, req, res);
      assert(!error && res.statusCode === 200, "Bot chat provisioning returns 200 OK");
      assert(res.data?.chatName === "AI Assistant", "Chat name is 'AI Assistant'");
      assert(res.data?.users?.length === 2, "Chat contains exactly user and AI bot");
      botChatId = res.data?._id;
    }

    // Test 6: Interactive Chat with AI Assistant
    console.log("\n[Test 6] Multi-turn Chat with AI Assistant");
    {
      const { req, res } = createMockReqRes(
        { chatId: botChatId, message: "What are the best practices for real-time chat architectures?" },
        user1
      );
      const { error } = await runAsync(chatWithAssistant, req, res);
      assert(!error && res.statusCode === 200, "AI Assistant responds with 200 OK");
      assert(Boolean(res.data?.reply?.content), "AI bot returns message content");
      assert(res.data?.reply?.sender?.name === "AI Assistant", "Message sender is AI Assistant");
    }

    // Clean up
    await User.deleteMany({ email: { $in: [testUserEmail1, testUserEmail2] } });
    await Chat.deleteMany({ _id: { $in: [testChat._id, botChatId] } });
    await Message.deleteMany({ chat: { $in: [testChat._id, botChatId] } });

    console.log("\n==================================================");
    console.log("All Phase 2 AI Integration tests passed successfully!");
    console.log("==================================================\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runAiTests();
