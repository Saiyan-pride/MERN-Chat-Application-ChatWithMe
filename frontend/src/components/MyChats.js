import { useEffect, useState } from "react";
import { ChatState } from "../context/chatProvider";
import {
  Box,
  Button,
  HStack,
  Spinner,
  Stack,
  Tag,
  Text,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { AddIcon } from "@chakra-ui/icons";
import ChatLoading from "./ChatLoading";
import { getSender } from "../config/ChatLogic";
import GroupChatModal from "./Miscellaneous/GroupChatModal";
import { SparklesIcon } from "./Miscellaneous/AiIcons";

function MyChats({ fetchAgain }) {
  const { selectedChat, setSelectedChat, user, chats, setChats } = ChatState();
  const [aiLoading, setAiLoading] = useState(false);
  const toast = useToast();

  const fetchChats = async () => {
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      const { data } = await axios.get("/api/chat", config);
      setChats(data);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to load the chats",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
    }
  };

  useEffect(() => {
    if (user) fetchChats();
  }, [fetchAgain, user]);

  const isAiSelected =
    selectedChat?.chatName === "AI Assistant" ||
    selectedChat?.users?.some((u) => u.email === "ai.assistant@chatwithme.internal");

  const handleSelectAiAssistant = async () => {
    // Check if AI Assistant chat is already in chats list
    const existingAiChat = chats?.find(
      (c) =>
        c.chatName === "AI Assistant" ||
        c.users?.some((u) => u.email === "ai.assistant@chatwithme.internal")
    );

    if (existingAiChat) {
      setSelectedChat(existingAiChat);
      return;
    }

    setAiLoading(true);
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };
      const { data } = await axios.post("/api/ai/ensure-bot-chat", {}, config);
      if (data && data._id) {
        if (!chats.some((c) => c._id === data._id)) {
          setChats([data, ...chats]);
        }
        setSelectedChat(data);
      }
      setAiLoading(false);
    } catch (err) {
      toast({
        title: "Could not open AI Assistant",
        description: err.response?.data?.message || "Please try again later.",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      setAiLoading(false);
    }
  };

  const regularChats = (chats || []).filter(
    (c) =>
      c.chatName !== "AI Assistant" &&
      !c.users?.some((u) => u.email === "ai.assistant@chatwithme.internal")
  );

  return (
    <Box
      display={{ base: selectedChat ? "none" : "flex", md: "flex" }}
      flexDir="column"
      alignItems="center"
      padding={3}
      bg="white"
      width={{ base: "100%", md: "31%" }}
      borderRadius="lg"
      borderWidth="1px"
    >
      <Box
        pb={3}
        px={3}
        fontSize={{ base: "28px", md: "30px" }}
        fontFamily="Work sans"
        display="flex"
        width="100%"
        justifyContent="space-between"
        alignItems="center"
      >
        My Chats
        <GroupChatModal>
          <Button
            display="flex"
            fontSize={{ base: "17px", md: "10px", lg: "17px" }}
            rightIcon={<AddIcon />}
          >
            New Group Chat
          </Button>
        </GroupChatModal>
      </Box>

      <Box
        display="flex"
        flexDir="column"
        padding={3}
        bg="#F8F8F8"
        width="100%"
        height="100%"
        borderRadius="lg"
        overflowY="hidden"
      >
        {/* Pinned AI Assistant Contact */}
        <Box
          onClick={handleSelectAiAssistant}
          cursor="pointer"
          bg={isAiSelected ? "purple.600" : "white"}
          color={isAiSelected ? "white" : "gray.800"}
          borderColor="purple.300"
          borderWidth="1.5px"
          px={3}
          py={2.5}
          borderRadius="lg"
          mb={2}
          shadow="xs"
          transition="all 0.15s ease-in-out"
          _hover={{
            borderColor: "purple.400",
            shadow: "sm",
          }}
        >
          <HStack justify="space-between" align="center">
            <HStack spacing={2.5}>
              <Box
                bg={isAiSelected ? "whiteAlpha.300" : "purple.50"}
                p={1.5}
                borderRadius="md"
              >
                {aiLoading ? (
                  <Spinner size="xs" color={isAiSelected ? "white" : "purple.600"} />
                ) : (
                  <SparklesIcon
                    boxSize={4}
                    color={isAiSelected ? "white" : "purple.600"}
                  />
                )}
              </Box>
              <Box>
                <Text fontWeight="semibold" fontSize="sm">
                  AI Assistant
                </Text>
                <Text
                  fontSize="xs"
                  color={isAiSelected ? "whiteAlpha.800" : "gray.500"}
                >
                  Powered by Gemini
                </Text>
              </Box>
            </HStack>
            <Tag
              size="sm"
              colorScheme="purple"
              variant={isAiSelected ? "solid" : "subtle"}
            >
              BOT
            </Tag>
          </HStack>
        </Box>

        {chats ? (
          <Stack overflowY="scroll">
            {regularChats.map((chat) => (
              <Box
                onClick={() => setSelectedChat(chat)}
                cursor="pointer"
                bg={selectedChat?._id === chat._id ? "#38B2AC" : "#E8E8E8"}
                color={selectedChat?._id === chat._id ? "white" : "black"}
                px={3}
                py={2}
                borderRadius="lg"
                key={chat._id}
              >
                <Text>
                  {!chat.isGroupChat
                    ? getSender(user, chat.users)
                    : chat.chatName}
                </Text>
              </Box>
            ))}
          </Stack>
        ) : (
          <ChatLoading />
        )}
      </Box>
    </Box>
  );
}

export default MyChats;
