import {
  Box,
  FormControl,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Tag,
  Text,
  useToast,
} from "@chakra-ui/react";
import { ChatState } from "../context/chatProvider";
import { ArrowBackIcon, ViewIcon } from "@chakra-ui/icons";
import { getSender, getSenderFull } from "../config/ChatLogic";
import ProfileModal from "./Miscellaneous/ProfileModal";
import UpdateGroupChatModal from "./Miscellaneous/UpdateGroupChatModal";
import SummaryModal from "./Miscellaneous/SummaryModal";
import SmartReplyChips from "./Miscellaneous/SmartReplyChips";
import PolishMenu from "./Miscellaneous/PolishMenu";
import { SparklesIcon } from "./Miscellaneous/AiIcons";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./styles.css";
import ScrollableChat from "./ScrollableChat";
import io from "socket.io-client";
import animationData from "../animations/Typing.json";
import Lottie from "react-lottie";

const ENDPOINT = "http://localhost:5000";
let socket;

const defaultOptions = {
  loop: true,
  autoplay: true,
  animationData: animationData,
  rendererSettings: {
    preserveAspectRatio: "xMidYMid slice",
  },
};

function SingleChat({ fetchAgain, setFetchAgain }) {
  const { user, selectedChat, setSelectedChat, notification, setNotification } =
    ChatState();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const typingTimeoutRef = useRef(null);
  const selectedChatCompareRef = useRef();

  const toast = useToast();

  const isAiChat = Boolean(
    selectedChat?.chatName === "AI Assistant" ||
      selectedChat?.users?.some(
        (u) => u.email === "ai.assistant@chatwithme.internal"
      )
  );

  const fetchMessages = async () => {
    if (!selectedChat) return;
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      setLoading(true);
      const { data } = await axios.get(
        `/api/message/${selectedChat._id}`,
        config
      );
      setMessages(data);
      setLoading(false);

      if (!isAiChat) {
        socket.emit("join chat", selectedChat._id);
      }
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to load the Messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  const sendMessages = async (e) => {
    if (e.key === "Enter" && newMessage.trim()) {
      const messageToSend = newMessage.trim();
      if (!isAiChat) {
        socket.emit("stop typing", selectedChat._id);
      }
      setNewMessage("");

      try {
        const config = {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };
        const { data } = await axios.post(
          "/api/message/",
          {
            content: messageToSend,
            chatId: selectedChat._id,
          },
          config
        );

        if (!isAiChat) {
          socket.emit("new message", data);
        }
        setMessages((prev) => [...prev, data]);

        // If chatting with AI Assistant, trigger Gemini response
        if (isAiChat) {
          setAiLoading(true);
          try {
            const { data: aiData } = await axios.post(
              "/api/ai/chat",
              {
                chatId: selectedChat._id,
                message: messageToSend,
              },
              config
            );
            if (aiData?.reply) {
              setMessages((prev) => [...prev, aiData.reply]);
            }
          } catch (aiError) {
            const isLimit =
              aiError.response?.status === 429 ||
              aiError.response?.data?.errorType === "QUOTA_EXCEEDED" ||
              aiError.response?.data?.errorType === "RATE_LIMITED";

            toast({
              title: isLimit ? "AI Quota Limit Reached" : "AI Response Error",
              description:
                aiError.response?.data?.message || "Could not retrieve reply.",
              status: isLimit ? "warning" : "error",
              duration: 5000,
              isClosable: true,
              position: "top",
            });
          } finally {
            setAiLoading(false);
          }
        }
      } catch (error) {
        toast({
          title: "Error Occurred!",
          description: "Failed to send the Message",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
      }
    }
  };

  // 1. Initialize socket once per user
  useEffect(() => {
    socket = io(ENDPOINT);
    socket.emit("setup", user);

    socket.on("connected", () => setSocketConnected(true));

    socket.on("typing", (chatId) => {
      if (
        selectedChatCompareRef.current &&
        chatId === selectedChatCompareRef.current._id
      ) {
        setIsTyping(true);
      }
    });

    socket.on("stop typing", (chatId) => {
      if (
        selectedChatCompareRef.current &&
        chatId === selectedChatCompareRef.current._id
      ) {
        setIsTyping(false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // 2. Load messages on chat change and update reference safely
  useEffect(() => {
    fetchMessages();
    selectedChatCompareRef.current = selectedChat;
    setIsTyping(false);
    setAiLoading(false);
  }, [selectedChat]);

  // 3. Message receiver listener with deduplicated notifications
  useEffect(() => {
    const handleMessageReceived = (newMessageReceived) => {
      if (
        !selectedChatCompareRef.current ||
        selectedChatCompareRef.current._id !== newMessageReceived.chat._id
      ) {
        setNotification((prev) => {
          if (!prev.some((n) => n._id === newMessageReceived._id)) {
            return [newMessageReceived, ...prev];
          }
          return prev;
        });
        setFetchAgain(!fetchAgain);
      } else {
        setMessages((prev) => [...prev, newMessageReceived]);
      }
    };

    socket.on("message received", handleMessageReceived);

    return () => {
      socket.off("message received", handleMessageReceived);
    };
  }, [fetchAgain, setFetchAgain, setNotification]);

  const typingHandler = (e) => {
    setNewMessage(e.target.value);

    if (isAiChat || !socketConnected || !selectedChat) return;

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop typing", selectedChat._id);
      setTyping(false);
    }, 3000);
  };

  return (
    <>
      {selectedChat ? (
        <>
          <Text
            fontSize={{ base: "26px", md: "28px" }}
            pb={3}
            px={2}
            width="100%"
            fontFamily="Work sans"
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <IconButton
              display={{ base: "flex", md: "none" }}
              icon={<ArrowBackIcon />}
              onClick={() => setSelectedChat("")}
            />

            {isAiChat ? (
              <HStack spacing={2}>
                <SparklesIcon color="purple.500" boxSize={5} />
                <Text fontWeight="bold">AI Assistant</Text>
                <Tag size="sm" colorScheme="purple" variant="subtle">
                  Gemini
                </Tag>
              </HStack>
            ) : !selectedChat.isGroupChat ? (
              <>
                <Text noOfLines={1}>{getSender(user, selectedChat.users)}</Text>
                <HStack spacing={1}>
                  <SummaryModal
                    chatId={selectedChat._id}
                    chatName={getSender(user, selectedChat.users)}
                  />
                  <ProfileModal user={getSenderFull(user, selectedChat.users)}>
                    <IconButton icon={<ViewIcon />} />
                  </ProfileModal>
                </HStack>
              </>
            ) : (
              <>
                <Text noOfLines={1}>{selectedChat.chatName.toUpperCase()}</Text>
                <HStack spacing={1}>
                  <SummaryModal
                    chatId={selectedChat._id}
                    chatName={selectedChat.chatName}
                  />
                  <UpdateGroupChatModal
                    fetchMessages={fetchMessages}
                    fetchAgain={fetchAgain}
                    setFetchAgain={setFetchAgain}
                  />
                </HStack>
              </>
            )}
          </Text>

          <Box
            display="flex"
            flexDir="column"
            justifyContent="flex-end"
            padding={3}
            bg="#E8E8E8"
            width="100%"
            height="100%"
            borderRadius="lg"
            overflowY="hidden"
          >
            {loading ? (
              <Spinner
                size="xl"
                width={20}
                height={20}
                alignSelf="center"
                margin="auto"
              />
            ) : (
              <div className="Messages">
                <ScrollableChat messages={messages} />
              </div>
            )}

            {/* Smart contextual reply suggestions */}
            {!isAiChat && messages.length > 0 && (
              <SmartReplyChips
                chatId={selectedChat._id}
                lastMessage={messages[messages.length - 1]}
                onSelectReply={(text) => setNewMessage(text)}
              />
            )}

            <FormControl onKeyDown={sendMessages} isRequired marginTop={1}>
              {isTyping || aiLoading ? (
                <div>
                  <Lottie
                    options={defaultOptions}
                    height={30}
                    width={70}
                    style={{ marginBottom: 15, marginLeft: 0 }}
                  />
                </div>
              ) : (
                <></>
              )}
              <InputGroup>
                <Input
                  variant="filled"
                  bg="#E0E0E0"
                  placeholder={
                    isAiChat
                      ? "Ask AI Assistant anything..."
                      : "Type here..."
                  }
                  value={newMessage}
                  onChange={typingHandler}
                  pr="3.5rem"
                />
                <InputRightElement width="3.5rem">
                  <PolishMenu
                    draftText={newMessage}
                    onApplyPolish={(text) => setNewMessage(text)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
          </Box>
        </>
      ) : (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          height="100%"
        >
          <Text fontSize="3xl" paddingBottom={3} fontFamily="Work sans">
            Click on a user to start chatting
          </Text>
        </Box>
      )}
    </>
  );
}

export default SingleChat;
