import { EditIcon, ViewIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import axios from "axios";
import { ChatState } from "../../context/chatProvider";

function ProfileModal({ user, children }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user: loggedInUser, setUser } = ChatState();

  const isMyProfile =
    Boolean(loggedInUser && user && loggedInUser._id === user._id);
  const isGuest = user?.email === "guest@example.com";

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [pic, setPic] = useState(user?.pic || "");
  const [loading, setLoading] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPic(user.pic || "");
      setIsEditing(false);
    }
  }, [user, isOpen]);

  // Upload new image to Cloudinary (same preset as signup)
  const handleImageUpload = (file) => {
    if (!file) return;

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      toast({
        title: "Invalid File Type",
        description: "Please select a JPEG or PNG image.",
        status: "warning",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setUploadingPic(true);
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", "chat-app");
    data.append("cloud_name", "dujfejnco");

    fetch("https://api.cloudinary.com/v1_1/dujfejnco/image/upload", {
      method: "post",
      body: data,
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.secure_url) {
          setPic(resData.secure_url.toString());
          toast({
            title: "Photo Uploaded",
            description: "Click Save Changes to update your profile.",
            status: "success",
            duration: 3000,
            isClosable: true,
            position: "top",
          });
        } else {
          throw new Error("Failed to get image URL");
        }
        setUploadingPic(false);
      })
      .catch((err) => {
        console.error("Cloudinary error:", err);
        toast({
          title: "Image Upload Failed",
          description: "Could not upload image. You can also paste an image URL directly.",
          status: "error",
          duration: 4000,
          isClosable: true,
          position: "top",
        });
        setUploadingPic(false);
      });
  };

  // Save updated profile to backend
  const handleUpdateProfile = async () => {
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Name cannot be empty.",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    if (isGuest) {
      toast({
        title: "Action Not Allowed",
        description: "Guest demo profile cannot be modified.",
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loggedInUser.token}`,
        },
      };

      const { data } = await axios.put(
        "/api/user/profile",
        { name: name.trim(), pic },
        config
      );

      // Update global context & localStorage
      setUser(data);
      localStorage.setItem("userInfo", JSON.stringify(data));

      toast({
        title: "Profile Updated",
        description: "Your name and photo have been updated successfully.",
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      });

      setIsEditing(false);
      setLoading(false);
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error.response?.data?.message || "Failed to update profile.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  return (
    <>
      {children ? (
        <span onClick={onOpen}>{children}</span>
      ) : (
        <IconButton display={{ base: "flex" }} icon={<ViewIcon />} onClick={onOpen} />
      )}
      <Modal size="lg" onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay />
        <ModalContent minH="440px">
          <ModalHeader
            fontSize={{ base: "26px", md: "34px" }}
            fontFamily="Work sans"
            display="flex"
            justifyContent="center"
            textAlign="center"
          >
            {isEditing ? "Edit Profile" : user?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody
            display="flex"
            flexDir="column"
            alignItems="center"
            justifyContent="center"
            pb={4}
          >
            {!isEditing ? (
              // Read-only view
              <VStack spacing={4} w="100%">
                <Image
                  borderRadius="full"
                  boxSize="150px"
                  src={user?.pic}
                  alt={user?.name}
                  objectFit="cover"
                  fallbackSrc="https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"
                />
                <Text
                  fontSize={{ base: "20px", md: "24px" }}
                  fontFamily="Work sans"
                  color="gray.700"
                >
                  Email: {user?.email}
                </Text>

                {isMyProfile && !isGuest && (
                  <Button
                    leftIcon={<EditIcon />}
                    colorScheme="teal"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    mt={2}
                  >
                    Edit Name & Photo
                  </Button>
                )}
              </VStack>
            ) : (
              // Edit view (only accessible for logged-in user on their own profile)
              <VStack spacing={4} w="100%">
                <Box position="relative">
                  <Image
                    borderRadius="full"
                    boxSize="120px"
                    src={pic || user?.pic}
                    alt={name}
                    objectFit="cover"
                    fallbackSrc="https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"
                  />
                  {uploadingPic && (
                    <Text fontSize="xs" color="blue.500" textAlign="center" mt={1}>
                      Uploading...
                    </Text>
                  )}
                </Box>

                <FormControl id="profile-name" isRequired>
                  <FormLabel fontSize="sm">Display Name</FormLabel>
                  <Input
                    value={name}
                    placeholder="Enter your name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </FormControl>

                <FormControl id="profile-pic">
                  <FormLabel fontSize="sm">Change Profile Photo</FormLabel>
                  <Input
                    type="file"
                    p={1.5}
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files[0])}
                    isDisabled={uploadingPic}
                  />
                </FormControl>

                <FormControl id="profile-pic-url">
                  <FormLabel fontSize="xs" color="gray.500">
                    Or paste direct Image URL
                  </FormLabel>
                  <Input
                    size="sm"
                    value={pic}
                    placeholder="https://example.com/avatar.jpg"
                    onChange={(e) => setPic(e.target.value)}
                  />
                </FormControl>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            {isEditing ? (
              <Box display="flex" gap={2}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setName(user?.name || "");
                    setPic(user?.pic || "");
                  }}
                  isDisabled={loading || uploadingPic}
                >
                  Cancel
                </Button>
                <Button
                  colorScheme="blue"
                  onClick={handleUpdateProfile}
                  isLoading={loading || uploadingPic}
                >
                  Save Changes
                </Button>
              </Box>
            ) : (
              <Button onClick={onClose}>Close</Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default ProfileModal;
