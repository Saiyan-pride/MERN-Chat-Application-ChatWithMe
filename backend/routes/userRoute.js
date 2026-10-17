const express = require("express");
const {
  registerUser,
  authUser,
  allUsers,
  updateProfile,
} = require("../controllers/userControllers");
const {
  requestOtp,
  verifyOtp,
  resetPassword,
} = require("../controllers/passwordResetControllers");
const { protect } = require("../middleware/authMiddleware");
const router = express.Router();

router.route("/").post(registerUser).get(protect, allUsers);
router.route("/login").post(authUser);
router.route("/profile").put(protect, updateProfile);
router.route("/forgot-password").post(requestOtp);
router.route("/verify-otp").post(verifyOtp);
router.route("/reset-password").post(resetPassword);

module.exports = router;


