const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const crypto = require("crypto");
const User = require("../models/UserModel");
const Otp = require("../models/OtpModel");
const {
  requestOtp,
  verifyOtp,
  resetPassword,
} = require("../controllers/passwordResetControllers");
const { authUser } = require("../controllers/userControllers");
const { protect } = require("../middleware/authMiddleware");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Mock Express req, res, next helpers
const createMockReqRes = (body = {}, headers = {}, query = {}) => {
  const req = { body, headers, query };
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    send(payload) {
      this.data = payload;
      return this;
    },
  };
  return { req, res };
};

const runAsync = async (fn, req, res) => {
  let errorCaught = null;
  const next = (err) => {
    if (err) errorCaught = err;
  };
  try {
    await fn(req, res, next);
  } catch (err) {
    errorCaught = err;
  }
  return { res, error: errorCaught };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
};

async function runTests() {
  console.log("==================================================");
  console.log("Running Phase 1: Password Reset & OTP Test Suite");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB for tests.\n");

  const testEmail = "testuser_phase1@domain.com";
  const guestEmail = "guest@example.com";
  const initialPassword = "oldpassword123";
  const newPassword = "newpassword456";

  try {
    // 0. Setup: Clean existing test data and create a test user
    await User.deleteMany({ email: testEmail });
    await Otp.deleteMany({ email: testEmail });
    await Otp.deleteMany({ email: guestEmail });

    const testUser = await User.create({
      name: "Phase1 Tester",
      email: testEmail,
      password: initialPassword,
    });
    assert(testUser._id, "Test user created successfully");

    // 1. Invalid email input
    console.log("\n[Test 1] Invalid email input");
    {
      const { req, res } = createMockReqRes({ email: "invalid-email" });
      const { error } = await runAsync(requestOtp, req, res);
      assert(error && res.statusCode === 400, "Rejects email without '@' with 400 Bad Request");
    }

    // 2. Generic response for non-existent account (no account enumeration)
    console.log("\n[Test 2] Generic response for non-existent account");
    {
      const { req, res } = createMockReqRes({ email: "doesnotexist_9988@domain.com" });
      const { error } = await runAsync(requestOtp, req, res);
      assert(!error && res.statusCode === 200, "Returns 200 OK for non-existent email");
      assert(
        res.data?.message?.includes("verification code has been sent"),
        "Returns generic privacy-preserving message"
      );
      const otpInDb = await Otp.findOne({ email: "doesnotexist_9988@domain.com" });
      assert(!otpInDb, "Does not generate or persist OTP for non-existent email");
    }

    // 3. Guest account safeguard (guest@example.com cannot be reset)
    console.log("\n[Test 3] Guest account recovery safeguard");
    {
      const { req, res } = createMockReqRes({ email: guestEmail });
      const { error } = await runAsync(requestOtp, req, res);
      assert(error && res.statusCode === 400, "Rejects guest account password reset with 400 Bad Request");
      assert(
        error.message.includes("Password reset is disabled for the demo guest account"),
        "Returns explicit error message for demo guest account"
      );
      const otpInDb = await Otp.findOne({ email: guestEmail });
      assert(!otpInDb, "Does NOT create or send OTP for shared guest account");
    }

    // 4. Successful OTP generation for valid user
    console.log("\n[Test 4] OTP Generation & Hashing");
    let generatedRawOtp = null;
    {
      const { req, res } = createMockReqRes({ email: testEmail });
      const { error } = await runAsync(requestOtp, req, res);
      assert(!error && res.statusCode === 200, "Returns 200 OK for valid registered user");

      const otpRecord = await Otp.findOne({ email: testEmail, used: false });
      assert(otpRecord, "OTP record saved to database");
      assert(otpRecord.otpHash && otpRecord.otpHash.length === 64, "OTP stored as 64-char SHA-256 hash (never plaintext)");
      assert(otpRecord.attempts === 0, "Initial attempts counter is 0");
    }

    // 5. Rate limit & resend cooldown enforcement
    console.log("\n[Test 5] Resend cooldown enforcement");
    {
      const { req, res } = createMockReqRes({ email: testEmail });
      const { error } = await runAsync(requestOtp, req, res);
      assert(
        error && res.statusCode === 429,
        "Blocks immediate resend with 429 Too Many Requests"
      );
    }

    // 6. Test OTP verification: wrong code and attempt counter
    console.log("\n[Test 6] OTP verification - incorrect code");
    {
      const { req, res } = createMockReqRes({ email: testEmail, otp: "000000" });
      const { error } = await runAsync(verifyOtp, req, res);
      assert(error && res.statusCode === 400, "Rejects incorrect OTP with 400 Bad Request");

      const otpRecord = await Otp.findOne({ email: testEmail });
      assert(otpRecord.attempts === 1, "Increments attempts counter to 1");
    }

    // 7. Brute-force protection: lock out after 5 attempts
    console.log("\n[Test 7] Brute-force protection (max 5 attempts)");
    {
      const otpRecord = await Otp.findOne({ email: testEmail });
      otpRecord.attempts = 5;
      await otpRecord.save();

      const { req, res } = createMockReqRes({ email: testEmail, otp: "111111" });
      const { error } = await runAsync(verifyOtp, req, res);
      assert(
        error && error.message.includes("Too many failed attempts"),
        "Invalidates code after exceeding attempt limit"
      );
      const afterLocked = await Otp.findOne({ email: testEmail });
      assert(!afterLocked, "Removes locked OTP record from database");
    }

    // 8. Correct OTP verification and single-use resetToken issuance
    console.log("\n[Test 8] Correct OTP verification & Reset Token issuance");
    let resetToken = null;
    {
      // Create a known OTP record directly for precision
      const rawCode = "654321";
      const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex");
      await Otp.create({
        email: testEmail,
        otpHash: codeHash,
        attempts: 0,
        resendLockUntil: new Date(),
        createdAt: new Date(),
      });

      const { req, res } = createMockReqRes({ email: testEmail, otp: rawCode });
      const { error } = await runAsync(verifyOtp, req, res);
      assert(!error && res.statusCode === 200, "Accepts correct 6-digit OTP");
      assert(res.data?.resetToken, "Issues single-use reset authorization token");
      resetToken = res.data.resetToken;

      const record = await Otp.findOne({ email: testEmail });
      assert(record.otpHash === "VERIFIED", "Marks OTP state as VERIFIED");
      assert(record.resetTokenHash, "Stores hashed reset token in database");
    }

    // 9. Reset token separation from login token (Security check)
    console.log("\n[Test 9] Reset token cannot be used as a JWT auth token");
    {
      const { req, res } = createMockReqRes({}, { authorization: `Bearer ${resetToken}` });
      const { error } = await runAsync(protect, req, res);
      assert(
        error && res.statusCode === 401,
        "Protected chat routes reject resetToken (cannot be used for login)"
      );
    }

    // 10. Password validation: mismatch and minimum length
    console.log("\n[Test 10] Password validation");
    {
      const { req, res } = createMockReqRes({
        email: testEmail,
        resetToken,
        password: "short",
        confirmPassword: "short",
      });
      const { error } = await runAsync(resetPassword, req, res);
      assert(error && error.message.includes("at least 6 characters"), "Enforces min 6 characters");
    }
    {
      const { req, res } = createMockReqRes({
        email: testEmail,
        resetToken,
        password: "newpassword456",
        confirmPassword: "mismatchedpassword",
      });
      const { error } = await runAsync(resetPassword, req, res);
      assert(error && error.message.includes("Passwords do not match"), "Enforces matching passwords");
    }

    // 11. Successful password reset
    console.log("\n[Test 11] Successful password update");
    {
      const { req, res } = createMockReqRes({
        email: testEmail,
        resetToken,
        password: newPassword,
        confirmPassword: newPassword,
      });
      const { error } = await runAsync(resetPassword, req, res);
      assert(!error && res.statusCode === 200, "Password reset succeeds with 200 OK");
      assert(!res.data?.token, "Does NOT automatically log in user (no login token returned)");
    }

    // 12. Single-use enforcement: re-using the same resetToken must fail
    console.log("\n[Test 12] Single-use token invalidation");
    {
      const { req, res } = createMockReqRes({
        email: testEmail,
        resetToken,
        password: "anotherpassword789",
        confirmPassword: "anotherpassword789",
      });
      const { error } = await runAsync(resetPassword, req, res);
      assert(error && res.statusCode === 400, "Reusing the same resetToken is rejected");
    }

    // 13. Verify subsequent login with new password vs old password
    console.log("\n[Test 13] Login verification with new credentials");
    {
      // Attempt login with old password -> must fail
      const { req, res } = createMockReqRes({ email: testEmail, password: initialPassword });
      const { error } = await runAsync(authUser, req, res);
      assert(error && res.statusCode === 400, "Old password no longer valid");
    }
    {
      // Attempt login with new password -> must succeed
      const { req, res } = createMockReqRes({ email: testEmail, password: newPassword });
      const { error } = await runAsync(authUser, req, res);
      assert(!error && res.statusCode === 200, "Login with new password succeeds");
      assert(res.data?.token, "Returns authenticated user session and JWT token");
    }

    // Cleanup test user
    await User.deleteMany({ email: testEmail });
    await Otp.deleteMany({ email: testEmail });

    console.log("\n==================================================");
    console.log("All 13 Phase 1 tests passed successfully!");
    console.log("==================================================");
  } catch (err) {
    console.error("\n❌ Test Suite Failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
