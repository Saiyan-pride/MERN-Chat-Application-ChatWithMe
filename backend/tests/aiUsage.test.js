const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const User = require("../models/UserModel");
const AiUsage = require("../models/AiUsageModel");
const {
  checkAndReserveAiQuota,
  rollbackAiQuota,
  getUtcDateString,
  getLimits,
} = require("../middleware/aiUsageMiddleware");
const { getAiUsageStatus } = require("../controllers/aiControllers");

const createMockReqRes = (user, body = {}) => {
  const req = {
    user,
    body,
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

const runMiddleware = (middleware, req, res) => {
  return new Promise((resolve) => {
    let nextCalled = false;
    middleware(req, res, (err) => {
      nextCalled = true;
      resolve({ req, res, nextCalled, err });
    })
      .then(() => {
        if (!nextCalled) {
          resolve({ req, res, nextCalled: false });
        }
      })
      .catch((err) => {
        resolve({ req, res, nextCalled: false, err });
      });
  });
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
};

async function runAiUsageTests() {
  console.log("==================================================");
  console.log("Running Phase 2: AI Usage Management Test Suite");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for AI Usage tests.\n");

  const testEmail1 = "ai_usage_tester1@domain.com";
  const testEmail2 = "ai_usage_tester2_concurrent@domain.com";
  const todayStr = getUtcDateString();
  const limits = getLimits();

  try {
    // Setup clean test users
    await User.deleteMany({ email: { $in: [testEmail1, testEmail2] } });
    const user1 = await User.create({
      name: "AI Usage Tester 1",
      email: testEmail1,
      password: "password123",
    });
    const user2 = await User.create({
      name: "AI Usage Tester 2",
      email: testEmail2,
      password: "password123",
    });

    await AiUsage.deleteMany({ user: { $in: [user1._id, user2._id] } });

    // Test 1: Feature Daily Quota Enforcement
    console.log("\n[Test 1] Feature Daily Quota Enforcement (Summarizer)");
    {
      // Seed user1 with summarize = (limit - 1)
      await AiUsage.create({
        user: user1._id,
        date: todayStr,
        counts: {
          assistant: 0,
          smartReply: 0,
          summarize: limits.summarize - 1,
          polish: 0,
          total: limits.summarize - 1,
        },
        recentRequests: [],
      });

      // 1st request should succeed and consume last remaining slot
      const mock1 = createMockReqRes(user1);
      const res1 = await runMiddleware(
        checkAndReserveAiQuota("summarize"),
        mock1.req,
        mock1.res
      );
      assert(res1.nextCalled === true, "Request succeeds when 1 slot remains");
      assert(
        mock1.req.aiUsage?.remaining === 0,
        "Remaining count decrements to 0"
      );
      assert(
        mock1.req.aiUsage?.used === limits.summarize,
        "Used count equals feature limit"
      );

      // 2nd request should be rejected with HTTP 429
      const mock2 = createMockReqRes(user1);
      const res2 = await runMiddleware(
        checkAndReserveAiQuota("summarize"),
        mock2.req,
        mock2.res
      );
      assert(
        res2.nextCalled === false && mock2.res.statusCode === 429,
        "Next request rejected with HTTP 429"
      );
      assert(
        mock2.res.data?.errorType === "QUOTA_EXCEEDED",
        "Error type is QUOTA_EXCEEDED"
      );
      assert(
        mock2.res.data?.limitType === "feature",
        "Limit type indicates specific feature"
      );
    }

    // Test 2: Combined Daily Quota Enforcement
    console.log("\n[Test 2] Combined Daily Quota Enforcement");
    {
      // Seed user1 with total = (combinedLimit - 1), but assistant count low
      await AiUsage.updateOne(
        { user: user1._id, date: todayStr },
        {
          $set: {
            "counts.assistant": 5,
            "counts.total": limits.combined - 1,
            recentRequests: [],
          },
        }
      );

      // 1st request succeeds and fills combined limit
      const mock1 = createMockReqRes(user1);
      const res1 = await runMiddleware(
        checkAndReserveAiQuota("assistant"),
        mock1.req,
        mock1.res
      );
      assert(
        res1.nextCalled === true,
        "Request succeeds when combined quota has 1 slot left"
      );
      assert(
        mock1.req.aiUsage?.combinedRemaining === 0,
        "Combined remaining count reaches 0"
      );

      // 2nd request should fail on combined cap even though assistant has room
      const mock2 = createMockReqRes(user1);
      const res2 = await runMiddleware(
        checkAndReserveAiQuota("assistant"),
        mock2.req,
        mock2.res
      );
      assert(
        res2.nextCalled === false && mock2.res.statusCode === 429,
        "Combined limit rejects request with HTTP 429"
      );
      assert(
        mock2.res.data?.limitType === "combined",
        "Limit type is correctly marked as combined"
      );
    }

    // Test 3: Short-Term Burst Rate Limiter (Sliding 60 seconds)
    console.log("\n[Test 3] Sliding 60-Second Short-Term Burst Rate Limiter");
    {
      await AiUsage.updateOne(
        { user: user1._id, date: todayStr },
        {
          $set: {
            counts: {
              assistant: 0,
              smartReply: 0,
              summarize: 0,
              polish: 0,
              total: 0,
            },
            recentRequests: [],
          },
        }
      );

      // Fire requests up to perMinute limit
      for (let i = 1; i <= limits.perMinute; i++) {
        const mock = createMockReqRes(user1);
        const res = await runMiddleware(
          checkAndReserveAiQuota("polish"),
          mock.req,
          mock.res
        );
        assert(
          res.nextCalled === true,
          `Burst request ${i}/${limits.perMinute} accepted`
        );
      }

      // Next request in same minute must be throttled
      const mockExceed = createMockReqRes(user1);
      const resExceed = await runMiddleware(
        checkAndReserveAiQuota("polish"),
        mockExceed.req,
        mockExceed.res
      );
      assert(
        resExceed.nextCalled === false && mockExceed.res.statusCode === 429,
        "Exceeding burst limit yields HTTP 429"
      );
      assert(
        mockExceed.res.data?.errorType === "RATE_LIMITED",
        "Error type is RATE_LIMITED"
      );
      assert(
        mockExceed.res.data?.limitType === "short_term",
        "Limit type is short_term"
      );
      assert(
        typeof mockExceed.res.data?.retryAfter === "number",
        "Returns valid retryAfter seconds"
      );
    }

    // Test 4: Concurrency & Race Condition Protection (Promise.all)
    console.log(
      "\n[Test 4] Concurrency & Race Condition Protection (Parallel Requests)"
    );
    {
      // Prepare user2 with 2 remaining slots for summarize
      await AiUsage.create({
        user: user2._id,
        date: todayStr,
        counts: {
          assistant: 0,
          smartReply: 0,
          summarize: limits.summarize - 2,
          polish: 0,
          total: limits.summarize - 2,
        },
        recentRequests: [],
      });

      // Fire 10 simultaneous parallel requests
      const concurrentRequests = Array.from({ length: 10 }).map(() => {
        const mock = createMockReqRes(user2);
        return runMiddleware(
          checkAndReserveAiQuota("summarize"),
          mock.req,
          mock.res
        );
      });

      const concurrentResults = await Promise.all(concurrentRequests);
      const successCount = concurrentResults.filter(
        (r) => r.nextCalled === true
      ).length;
      const rejectedCount = concurrentResults.filter(
        (r) => r.res.statusCode === 429
      ).length;

      assert(
        successCount === 2,
        `Exactly 2 concurrent requests succeeded (actual: ${successCount})`
      );
      assert(
        rejectedCount === 8,
        `Exactly 8 concurrent requests rejected with HTTP 429 (actual: ${rejectedCount})`
      );

      // Verify in MongoDB that count never exceeded limit
      const finalDoc = await AiUsage.findOne({
        user: user2._id,
        date: todayStr,
      });
      assert(
        finalDoc.counts.summarize === limits.summarize,
        `Database counter strictly matches limit (${finalDoc.counts.summarize}/${limits.summarize})`
      );
    }

    // Test 5: Fallback Mode Exemption from Daily Quota
    console.log("\n[Test 5] Fallback Mode Exemption from Daily Quota");
    {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = ""; // Simulate missing key

      await AiUsage.updateOne(
        { user: user1._id, date: todayStr },
        {
          $set: {
            "counts.polish": 2,
            "counts.total": 2,
            recentRequests: [],
          },
        }
      );

      const mock = createMockReqRes(user1);
      const res = await runMiddleware(
        checkAndReserveAiQuota("polish"),
        mock.req,
        mock.res
      );
      assert(res.nextCalled === true, "Fallback request allowed through");
      assert(
        mock.req.aiUsage?.isFallback === true,
        "aiUsage tagged with isFallback = true"
      );
      assert(
        mock.req.aiUsage?.reserved === false,
        "No quota was reserved in fallback mode"
      );

      const docAfter = await AiUsage.findOne({
        user: user1._id,
        date: todayStr,
      });
      assert(
        docAfter.counts.polish === 2,
        "Daily counter was NOT incremented for fallback request"
      );

      process.env.GEMINI_API_KEY = originalKey; // Restore key
    }

    // Test 6: Quota Rollback / Refund on Provider Failure
    console.log("\n[Test 6] Quota Rollback on Upstream Failure");
    {
      await AiUsage.updateOne(
        { user: user1._id, date: todayStr },
        {
          $set: {
            "counts.assistant": 3,
            "counts.total": 3,
            recentRequests: [],
          },
        }
      );

      const mock = createMockReqRes(user1);
      await runMiddleware(
        checkAndReserveAiQuota("assistant"),
        mock.req,
        mock.res
      );

      const docReserved = await AiUsage.findOne({
        user: user1._id,
        date: todayStr,
      });
      assert(
        docReserved.counts.assistant === 4,
        "Quota initially reserved (+1)"
      );

      // Perform rollback
      await rollbackAiQuota(mock.req);

      const docRefunded = await AiUsage.findOne({
        user: user1._id,
        date: todayStr,
      });
      assert(
        docRefunded.counts.assistant === 3,
        "Quota refunded after rollback (-1)"
      );
      assert(
        docRefunded.counts.total === 3,
        "Total count refunded after rollback (-1)"
      );
    }

    // Test 7: GET /api/ai/usage Status Endpoint
    console.log("\n[Test 7] GET /api/ai/usage Status Endpoint");
    {
      const mock = createMockReqRes(user1);
      await getAiUsageStatus(mock.req, mock.res);

      assert(mock.res.statusCode === 200, "Usage status returns 200 OK");
      assert(mock.res.data?.success === true, "Response reports success = true");
      assert(mock.res.data?.date === todayStr, "Returns current UTC date");
      assert(
        Boolean(mock.res.data?.limits?.assistant),
        "Contains assistant limit metadata"
      );
      assert(
        Boolean(mock.res.data?.limits?.smartReply),
        "Contains smartReply limit metadata"
      );
      assert(
        Boolean(mock.res.data?.limits?.summarize),
        "Contains summarize limit metadata"
      );
      assert(
        Boolean(mock.res.data?.limits?.polish),
        "Contains polish limit metadata"
      );
      assert(
        Boolean(mock.res.data?.limits?.combined),
        "Contains combined limit metadata"
      );
      assert(
        Boolean(mock.res.data?.resetsAt),
        "Contains UTC reset timestamp"
      );
    }

    // Cleanup
    await User.deleteMany({ email: { $in: [testEmail1, testEmail2] } });
    await AiUsage.deleteMany({ user: { $in: [user1._id, user2._id] } });

    console.log("\n==================================================");
    console.log("All Phase 2 AI Usage Management tests passed!");
    console.log("==================================================\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runAiUsageTests();
