import {
  Box,
  CloseButton,
  HStack,
  Tag,
  TagLabel,
  TagLeftIcon,
  useColorModeValue,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import axios from "axios";
import { ChatState } from "../../context/chatProvider";
import { SparklesIcon } from "./AiIcons";

function SmartReplyChips({ chatId, lastMessage, onSelectReply }) {
  const { user } = ChatState();
  const [replies, setReplies] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  const chipBg = useColorModeValue("white", "gray.700");
  const chipBorder = useColorModeValue("purple.200", "purple.600");

  useEffect(() => {
    setDismissed(false);
    if (!chatId || !lastMessage || !user) {
      setReplies([]);
      return;
    }

    // Do not show smart replies if the current user sent the last message
    const lastSenderId = lastMessage.sender?._id || lastMessage.sender;
    if (lastSenderId?.toString() === user._id?.toString()) {
      setReplies([]);
      return;
    }

    let isMounted = true;
    const fetchReplies = async () => {
      try {
        const config = {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };
        const { data } = await axios.post("/api/ai/smart-reply", { chatId }, config);
        if (isMounted && data.replies && data.replies.length > 0) {
          setReplies(data.replies);
        }
      } catch (err) {
        // Silently catch smart reply errors so chat flow is never interrupted
        if (isMounted) setReplies([]);
      }
    };

    fetchReplies();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, lastMessage?._id, user]);

  if (dismissed || !replies || replies.length === 0) {
    return null;
  }

  return (
    <Box width="100%" px={1} mb={2}>
      <HStack spacing={2} wrap="wrap" align="center">
        {replies.map((reply, idx) => (
          <Tag
            key={idx}
            size="md"
            variant="outline"
            bg={chipBg}
            borderColor={chipBorder}
            color="purple.700"
            borderRadius="full"
            cursor="pointer"
            py={1.5}
            px={3}
            transition="all 0.15s ease-in-out"
            _hover={{
              bg: "purple.50",
              borderColor: "purple.400",
              transform: "translateY(-1px)",
              shadow: "sm",
            }}
            onClick={() => onSelectReply(reply)}
          >
            <TagLeftIcon as={SparklesIcon} color="purple.500" boxSize={3.5} />
            <TagLabel fontSize="xs" fontWeight="medium">
              {reply}
            </TagLabel>
          </Tag>
        ))}
        <CloseButton
          size="sm"
          color="gray.400"
          onClick={() => setDismissed(true)}
          title="Dismiss suggestions"
        />
      </HStack>
    </Box>
  );
}

export default SmartReplyChips;
