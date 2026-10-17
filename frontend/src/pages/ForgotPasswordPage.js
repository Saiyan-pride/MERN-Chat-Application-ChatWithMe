import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  FormHelperText,
  HStack,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  PinInput,
  PinInputField,
  Text,
  VStack,
  useToast,
  Badge,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import axios from "axios";
import { useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";

function ForgotPasswordPage() {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: Reset Password
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Controlled resend countdown (60 seconds)
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  const toast = useToast();
  const history = useHistory();

  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [countdown]);

  // Step 1: Request 6-digit OTP
  const handleRequestOtp = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    const normalized = email.toLowerCase().trim();
    if (
      normalized === "guest@example.com" ||
      normalized.endsWith("@example.com")
    ) {
      toast({
        title: "Action Disabled",
        description: "Password reset is disabled for the demo guest account.",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      const config = {
        headers: { "Content-Type": "application/json" },
      };
      const { data } = await axios.post(
        "/api/user/forgot-password",
        { email },
        config
      );

      toast({
        title: "Request Sent",
        description: data.message,
        status: "info",
        duration: 5000,
        isClosable: true,
        position: "top",
      });

      setStep(2);
      setCountdown(60);
      setLoading(false);
    } catch (error) {
      toast({
        title: "Error Occurred",
        description:
          error.response?.data?.message || "Failed to process request.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  // Step 2: Resend OTP
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const config = {
        headers: { "Content-Type": "application/json" },
      };
      const { data } = await axios.post(
        "/api/user/forgot-password",
        { email },
        config
      );
      toast({
        title: "New Code Sent",
        description: data.message,
        status: "info",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setCountdown(60);
      setOtp("");
      setLoading(false);
    } catch (error) {
      toast({
        title: "Resend Failed",
        description:
          error.response?.data?.message || "Failed to resend code.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast({
        title: "Incomplete Code",
        description: "Please enter the full 6-digit code.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      const config = {
        headers: { "Content-Type": "application/json" },
      };
      const { data } = await axios.post(
        "/api/user/verify-otp",
        { email, otp },
        config
      );

      setResetToken(data.resetToken);
      toast({
        title: "Code Verified",
        description: "Please choose your new password.",
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      });

      setStep(3);
      setLoading(false);
    } catch (error) {
      toast({
        title: "Verification Failed",
        description:
          error.response?.data?.message || "Invalid or expired code.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      toast({
        title: "Missing Fields",
        description: "Please fill in both password fields.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Do Not Match",
        description: "Make sure both passwords match exactly.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      const config = {
        headers: { "Content-Type": "application/json" },
      };
      const { data } = await axios.post(
        "/api/user/reset-password",
        {
          email,
          resetToken,
          password,
          confirmPassword,
        },
        config
      );

      toast({
        title: "Password Reset Successful",
        description: data.message,
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "top",
      });

      setLoading(false);
      // Navigate back to login
      history.push("/");
    } catch (error) {
      toast({
        title: "Reset Failed",
        description:
          error.response?.data?.message || "Failed to reset password.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  return (
    <Container maxW="xl" centerContent py={6}>
      <Box
        display="flex"
        justifyContent="center"
        p={3}
        bg="whiteAlpha.900"
        w="100%"
        m="20px 0 15px 0"
        borderRadius="lg"
        borderWidth="1px"
      >
        <Text fontSize="4xl" fontFamily="Playfair Display" textAlign="center">
          ChatWithMe
        </Text>
      </Box>

      <Box
        bg="whiteAlpha.900"
        w="100%"
        p={6}
        borderRadius="lg"
        borderWidth="1px"
      >
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Button
              leftIcon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={() => history.push("/")}
            >
              Back to Login
            </Button>
            <Badge colorScheme={step === 3 ? "green" : "blue"} p={1} borderRadius="md">
              Step {step} of 3
            </Badge>
          </HStack>

          <Heading size="md" textAlign="center" color="gray.700">
            {step === 1 && "Forgot Password"}
            {step === 2 && "Enter Verification Code"}
            {step === 3 && "Set New Password"}
          </Heading>

          {/* STEP 1: Enter Email */}
          {step === 1 && (
            <VStack spacing={4} mt={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Enter your account email address. If an account is found, we will send a 6-digit verification code.
              </Text>
              <FormControl id="reset-email" isRequired>
                <FormLabel>Email Address</FormLabel>
                <Input
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                />
                <FormHelperText>
                  For security, guest and demo accounts cannot be reset.
                </FormHelperText>
              </FormControl>

              <Button
                colorScheme="blue"
                width="100%"
                onClick={handleRequestOtp}
                isLoading={loading}
                mt={2}
              >
                Send Verification Code
              </Button>
            </VStack>
          )}

          {/* STEP 2: Enter 6-digit OTP */}
          {step === 2 && (
            <VStack spacing={4} mt={2}>
              <Alert status="info" borderRadius="md" py={2}>
                <AlertIcon />
                <Text fontSize="xs">
                  A 6-digit code was sent to <strong>{email}</strong>. It expires in 5 minutes.
                </Text>
              </Alert>

              <FormControl id="otp" isRequired>
                <FormLabel textAlign="center">6-Digit Code</FormLabel>
                <HStack justify="center" py={2}>
                  <PinInput
                    otp
                    size="lg"
                    value={otp}
                    onChange={(val) => setOtp(val)}
                  >
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                  </PinInput>
                </HStack>
              </FormControl>

              <Button
                colorScheme="blue"
                width="100%"
                onClick={handleVerifyOtp}
                isLoading={loading}
              >
                Verify Code
              </Button>

              <HStack justify="space-between" width="100%" pt={2}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                  }}
                >
                  Change Email
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="blue"
                  onClick={handleResendOtp}
                  isDisabled={countdown > 0}
                  isLoading={loading}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
                </Button>
              </HStack>
            </VStack>
          )}

          {/* STEP 3: Reset Password */}
          {step === 3 && (
            <VStack spacing={4} mt={2}>
              <Alert status="success" borderRadius="md" py={2}>
                <AlertIcon />
                <Text fontSize="xs">
                  Code verified. Create a secure password for <strong>{email}</strong>.
                </Text>
              </Alert>

              <FormControl id="new-password" isRequired>
                <FormLabel>New Password</FormLabel>
                <InputGroup size="md">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="Enter new password (min. 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <InputRightElement width="4.5rem">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={() => setShowPass(!showPass)}
                    >
                      {showPass ? "Hide" : "Show"}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <FormControl id="confirm-password" isRequired>
                <FormLabel>Confirm Password</FormLabel>
                <InputGroup size="md">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                  />
                  <InputRightElement width="4.5rem">
                    <Button
                      h="1.75rem"
                      size="sm"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? "Hide" : "Show"}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <Button
                colorScheme="green"
                width="100%"
                onClick={handleResetPassword}
                isLoading={loading}
                mt={2}
              >
                Reset Password
              </Button>
            </VStack>
          )}
        </VStack>
      </Box>
    </Container>
  );
}

export default ForgotPasswordPage;