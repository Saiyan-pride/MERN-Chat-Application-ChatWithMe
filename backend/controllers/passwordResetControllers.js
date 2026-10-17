const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const User = require("../models/UserModel");
const Otp = require("../models/OtpModel");
const {
  sendOtpEmail,
  sendPasswordResetSuccessEmail,
} = require("../config/nodemailer");

/*
 * @desc    Request a 6-digit OTP for password reset
 * @route   POST /api/user/forgot-password
 * @access  Public
 */
const requestOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Protect shared guest accounts from being reset or locking out demo users
  const isGuestAccount =
    normalizedEmail === "guest@example.com" ||
    normalizedEmail.endsWith("@example.com");

  if (isGuestAccount) {
    res.status(400);
    throw new Error("Password reset is disabled for the demo guest account.");
  }

  // Always return the exact same response to prevent account enumeration
  const genericSuccessResponse = {
    success: true,
    message:
      "If an account exists with this email, a 6-digit verification code has been sent.",
  };

  // Check if account actually exists in our database
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(200).json(genericSuccessResponse);
  }

  // Enforce controlled resend cooldown (60 seconds)
  const existingOtp = await Otp.findOne({
    email: normalizedEmail,
    used: false,
  });

  if (existingOtp && existingOtp.resendLockUntil > Date.now()) {
    const secondsRemaining = Math.ceil(
      (existingOtp.resendLockUntil - Date.now()) / 1000,
    );
    res.status(429);
    throw new Error(
      `Please wait ${secondsRemaining} second(s) before requesting a new code.`,
    );
  }

  // Invalidate any prior active OTPs for this account
  await Otp.deleteMany({ email: normalizedEmail });

  // Generate cryptographically secure 6-digit OTP
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(rawOtp).digest("hex");

  // 60s cooldown for resending, 5 minutes total TTL
  const resendLockUntil = new Date(Date.now() + 60 * 1000);

  await Otp.create({
    email: normalizedEmail,
    otpHash,
    attempts: 0,
    resendLockUntil,
    createdAt: new Date(),
  });

  // Dispatch email asynchronously
  try {
    await sendOtpEmail(normalizedEmail, rawOtp);
  } catch (mailError) {
    console.error("Failed to send OTP email:", mailError.message);
    // Even if mail delivery fails, do not expose internal network errors to clients
  }

  res.status(200).json(genericSuccessResponse);
});

/*
 * @desc    Verify 6-digit OTP and issue a short-lived, single-use reset authorization token
 * @route   POST /api/user/verify-otp
 * @access  Public
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and 6-digit verification code are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const cleanOtp = String(otp).trim();

  const record = await Otp.findOne({
    email: normalizedEmail,
    used: false,
  });

  if (!record) {
    res.status(400);
    throw new Error(
      "Invalid or expired verification code. Please request a new one.",
    );
  }

  // Brute-force protection: Max 5 attempts
  if (record.attempts >= 5) {
    await Otp.deleteOne({ _id: record._id });
    res.status(400);
    throw new Error(
      "Too many failed attempts. This code has been invalidated. Please request a new one.",
    );
  }

  const inputHash = crypto.createHash("sha256").update(cleanOtp).digest("hex");

  // Timing-safe constant-time comparison against stored hash
  const isValid =
    record.otpHash.length === inputHash.length &&
    crypto.timingSafeEqual(Buffer.from(record.otpHash), Buffer.from(inputHash));

  if (!isValid) {
    record.attempts += 1;
    await record.save();
    const remaining = 5 - record.attempts;
    res.status(400);
    throw new Error(`Incorrect code. ${remaining} attempt(s) remaining.`);
  }

  // Issue dedicated single-use reset authorization (NOT a login token)
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  record.otpHash = "VERIFIED";
  record.resetTokenHash = resetTokenHash;
  record.resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await record.save();

  res.status(200).json({
    success: true,
    message: "Code verified successfully.",
    resetToken,
  });
});

/*
 * @desc    Reset password using single-use authorization token
 * @route   POST /api/user/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, resetToken, password, confirmPassword } = req.body;

  if (!email || !resetToken || !password || !confirmPassword) {
    res.status(400);
    throw new Error("All fields are required");
  }

  if (password !== confirmPassword) {
    res.status(400);
    throw new Error("Passwords do not match");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters long");
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (
    normalizedEmail === "guest@example.com" ||
    normalizedEmail.endsWith("@example.com")
  ) {
    res.status(400);
    throw new Error("Password reset is disabled for the demo guest account.");
  }

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(String(resetToken).trim())
    .digest("hex");

  const record = await Otp.findOne({
    email: normalizedEmail,
    resetTokenHash,
    used: false,
  });

  if (
    !record ||
    !record.resetTokenExpiresAt ||
    record.resetTokenExpiresAt < Date.now()
  ) {
    res.status(400);
    throw new Error(
      "Password reset session has expired or is invalid. Please start over.",
    );
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    res.status(404);
    throw new Error("Account not found");
  }

  // Update password (triggers User pre-save bcrypt hashing hook)
  user.password = password;
  await user.save();

  // Invalidate the single-use reset authorization token immediately
  await Otp.deleteMany({ email: normalizedEmail });

  // Send security notice email to the account owner
  sendPasswordResetSuccessEmail(normalizedEmail).catch((err) =>
    console.error("Failed to send password reset notice email:", err.message),
  );

  res.status(200).json({
    success: true,
    message:
      "Password reset successfully. You can now log in with your new password.",
  });
});

module.exports = {
  requestOtp,
  verifyOtp,
  resetPassword,
};
