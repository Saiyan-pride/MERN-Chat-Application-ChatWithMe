const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * AI Service for ChatWithMe
 * Integrates Google Gemini with automatic model resolution and graceful offline fallback.
 */

const getApiKey = () => process.env.GEMINI_API_KEY?.trim();

const MODEL_CANDIDATES = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

/**
 * Helper to run an operation against available Gemini model candidates
 */
const runWithGemini = async (fn) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = null;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      return await fn(model);
    } catch (err) {
      lastError = err;
      // If model not found (404) or busy (503), try next candidate
      if (
        err.message?.includes("404") ||
        err.message?.includes("503") ||
        err.message?.includes("not found") ||
        err.message?.includes("no longer available")
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Unable to connect to Google Gemini API");
};

/**
 * 1. Conversation Summarizer
 * Summarizes the recent messages of a chat into structured sections.
 */
const generateSummary = async (chatName, messages = []) => {
  if (!messages || messages.length === 0) {
    return {
      overview: "No recent messages found in this conversation to summarize.",
      keyPoints: ["The chat has no recorded message history yet."],
      actionItems: ["Start the conversation by sending a message."],
    };
  }

  // Format message dialogue
  const transcript = messages
    .map((m) => {
      const sender = m.sender?.name || "User";
      const text = m.content || "";
      return `${sender}: ${text}`;
    })
    .join("\n");

  const prompt = `You are an executive chat assistant for a professional chat app called ChatWithMe.
Summarize the following chat conversation titled "${chatName || "Chat"}".

Respond ONLY in strict, valid JSON format matching this schema without markdown code fences or backticks:
{
  "overview": "A concise 1-2 sentence executive summary of the conversation.",
  "keyPoints": [
    "Bullet point 1 detailing key topic discussed",
    "Bullet point 2 detailing key topic discussed",
    "Bullet point 3 (if applicable)"
  ],
  "actionItems": [
    "Any pending task, decision, or follow-up mentioned (or 'No open action items' if none)"
  ]
}

Conversation transcript:
${transcript}`;

  try {
    const result = await runWithGemini(async (model) => {
      const res = await model.generateContent(prompt);
      const rawText = res.response.text().trim();
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```$/g, "")
        .trim();
      return JSON.parse(cleaned);
    });

    if (result) return { ...result, isFallback: false };
  } catch (err) {
    console.error("Gemini summary generation failed:", err.message);
  }

  // Offline simulation fallback if no API key or API call failed
  const participants = Array.from(
    new Set(messages.map((m) => m.sender?.name || "Participant"))
  );
  const lastSender = messages[messages.length - 1]?.sender?.name || "Participant";
  return {
    overview: `Recent conversation between ${participants.join(", ")} comprising ${messages.length} message(s).`,
    keyPoints: [
      `Discussion active with ${messages.length} messages exchanged.`,
      `Latest point addressed by ${lastSender}.`,
      "Topics centered around ongoing collaboration and project updates.",
    ],
    actionItems: [
      "Review latest messages for outstanding questions.",
      "Follow up with team members on agreed items.",
    ],
    isFallback: true,
  };
};

/**
 * 2. Smart Replies
 * Generates 3 short, contextual response suggestions for the recipient.
 */
const generateSmartReplies = async (chatContext = [], lastMessage = "", senderName = "") => {
  const prompt = `You are a real-time smart reply engine for a messaging app.
The user just received this message from ${senderName || "a contact"}:
"${lastMessage}"

Recent chat context:
${chatContext.slice(-3).map((m) => `${m.sender?.name || "User"}: ${m.content}`).join("\n")}

Generate exactly 3 professional, natural quick responses that the recipient might say.
Each response MUST be concise (under 7 words).
Do NOT include emojis.
Respond ONLY with a valid JSON array of 3 strings, e.g. ["Understood.", "Let's do that.", "I will check."]`;

  try {
    const result = await runWithGemini(async (model) => {
      const res = await model.generateContent(prompt);
      const rawText = res.response.text().trim();
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```$/g, "")
        .trim();
      const replies = JSON.parse(cleaned);
      if (Array.isArray(replies) && replies.length > 0) {
        return replies.slice(0, 3).map((r) => String(r).replace(/[^\w\s.,!?'"-]/g, "").trim());
      }
      return null;
    });

    if (result && result.length > 0) return { replies: result, isFallback: false };
  } catch (err) {
    console.error("Gemini smart reply error:", err.message);
  }

  // Fallback heuristics
  const lower = String(lastMessage).toLowerCase();
  if (lower.includes("how are you") || lower.includes("how's it going")) {
    return {
      replies: ["Doing well, thank you!", "All good here, how about you?", "Busy but good!"],
      isFallback: true,
    };
  }
  if (lower.includes("meet") || lower.includes("time") || lower.includes("when")) {
    return {
      replies: ["Let me check my calendar.", "4 PM works for me.", "Could we do tomorrow?"],
      isFallback: true,
    };
  }
  if (lower.includes("ok") || lower.includes("thanks") || lower.includes("thank you")) {
    return {
      replies: ["You're welcome!", "Glad to help.", "Sounds good!"],
      isFallback: true,
    };
  }
  return {
    replies: ["Sounds good.", "I will check and get back to you.", "Understood, thank you."],
    isFallback: true,
  };
};

/**
 * 3. Message Polish & Tone Enhancer
 * Rephrases user drafts into specific professional tones or corrects grammar.
 */
const polishDraft = async (text = "", tone = "professional") => {
  if (!text || text.trim().length === 0) {
    return { polishedText: "", tone };
  }

  const toneInstructions = {
    professional: "Rewrite this message in a polite, confident, and professional corporate tone.",
    friendly: "Rewrite this message in a warm, welcoming, and friendly conversational tone without emojis.",
    concise: "Condense this message to be clear, direct, and brief, removing fluff while preserving core meaning.",
    grammar: "Fix all spelling, punctuation, and grammar mistakes while preserving the exact original style.",
  };

  const instruction = toneInstructions[tone] || toneInstructions.professional;

  const prompt = `You are a message writing assistant in a chat application.
Instruction: ${instruction}
Requirement: Return ONLY the rewritten message text. Do NOT add quotes, explanations, prefixes, or emojis.

Original draft:
${text}`;

  try {
    const result = await runWithGemini(async (model) => {
      const res = await model.generateContent(prompt);
      const polishedText = res.response.text().trim().replace(/^["']|["']$/g, "");
      return { polishedText, tone };
    });

    if (result) return { ...result, isFallback: false };
  } catch (err) {
    console.error("Gemini polish draft error:", err.message);
  }

  // Offline simulation fallback
  const clean = text.trim();
  if (tone === "concise")
    return {
      polishedText: clean
        .replace(/\b(just|basically|actually|kind of)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
      tone,
      isFallback: true,
    };
  if (tone === "professional")
    return { polishedText: `Please note: ${clean}`, tone, isFallback: true };
  if (tone === "friendly")
    return { polishedText: `Hope you are well! ${clean}`, tone, isFallback: true };
  return { polishedText: clean, tone, isFallback: true };
};

/**
 * 4. Multi-turn AI Assistant Chat
 * Answers user questions directly inside the dedicated AI Assistant chat room.
 */
const chatWithAi = async (history = [], userMessage = "") => {
  if (!userMessage || userMessage.trim().length === 0) {
    return {
      reply: "Please ask a question or provide a topic to discuss.",
      isFallback: true,
    };
  }

  // Convert past messages to Gemini history format
  const rawHistory = history
    .slice(-10)
    .filter((h) => h.content && typeof h.content === "string")
    .map((h) => ({
      role: h.isAi ? "model" : "user",
      parts: [{ text: h.content }],
    }));

  // Gemini API requires the first turn in history to have role: "user".
  // Strip any leading "model" turns (such as the initial welcome greeting).
  const firstUserIdx = rawHistory.findIndex((turn) => turn.role === "user");
  const formattedHistory = firstUserIdx !== -1 ? rawHistory.slice(firstUserIdx) : [];

  try {
    const result = await runWithGemini(async (model) => {
      const chat = model.startChat({
        history: formattedHistory,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const res = await chat.sendMessage(userMessage);
      const reply = res.response.text().trim();
      return { reply };
    });

    if (result) return { reply: result.reply, isFallback: false };
  } catch (err) {
    console.error("Gemini chat error:", err.message);
  }

  return {
    reply: "I am your ChatWithMe AI Assistant. I am online and ready to assist you!",
    isFallback: true,
  };
};

module.exports = {
  generateSummary,
  generateSmartReplies,
  polishDraft,
  chatWithAi,
};
