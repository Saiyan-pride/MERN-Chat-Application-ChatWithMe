import {
  Box,
  Button,
  Divider,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  SkeletonText,
  Tag,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { CopyIcon, RepeatIcon } from "@chakra-ui/icons";
import { useState } from "react";
import axios from "axios";
import { ChatState } from "../../context/chatProvider";
import {
  SparklesIcon,
  DocumentTextIcon,
  ListBulletIcon,
  CheckCircleSolidIcon,
} from "./AiIcons";

function SummaryModal({ chatId, chatName, children }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user } = ChatState();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const toast = useToast();

  const fetchSummary = async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };
      const { data } = await axios.post("/api/ai/summarize", { chatId }, config);
      setSummary(data.summary);
      setMessageCount(data.messageCount || 0);
      setLoading(false);
    } catch (error) {
      toast({
        title: "Summarization Failed",
        description:
          error.response?.data?.message || "Could not generate summary at this time.",
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  const handleOpen = () => {
    onOpen();
    if (!summary) {
      fetchSummary();
    }
  };

  const handleCopy = () => {
    if (!summary) return;
    const textToCopy = `Chat Summary: ${chatName}\n\nExecutive Overview:\n${
      summary.overview
    }\n\nKey Points:\n${summary.keyPoints
      .map((p) => `- ${p}`)
      .join("\n")}\n\nAction Items:\n${summary.actionItems
      .map((a) => `- ${a}`)
      .join("\n")}`;

    navigator.clipboard.writeText(textToCopy);
    toast({
      title: "Copied to Clipboard",
      description: "Chat summary has been copied as formatted text.",
      status: "success",
      duration: 3000,
      isClosable: true,
      position: "top",
    });
  };

  return (
    <>
      {children ? (
        <span onClick={handleOpen}>{children}</span>
      ) : (
        <Tooltip label="Summarize Conversation" placement="bottom" hasArrow>
          <IconButton
            aria-label="Summarize Conversation"
            icon={<SparklesIcon boxSize={4} color="purple.500" />}
            size="md"
            variant="ghost"
            onClick={handleOpen}
          />
        </Tooltip>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(3px)" />
        <ModalContent borderRadius="xl" shadow="2xl">
          <ModalHeader pb={2}>
            <HStack spacing={2} align="center">
              <SparklesIcon color="purple.500" boxSize={5} />
              <Text fontSize="lg" fontWeight="bold">
                Conversation Summary
              </Text>
              {messageCount > 0 && (
                <Tag size="sm" colorScheme="purple" variant="subtle">
                  {messageCount} messages analyzed
                </Tag>
              )}
            </HStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody py={3}>
            {loading ? (
              <VStack spacing={4} align="stretch" py={4}>
                <Skeleton height="24px" width="40%" />
                <SkeletonText mt="2" noOfLines={3} spacing="3" />
                <Divider my={2} />
                <Skeleton height="24px" width="30%" />
                <SkeletonText mt="2" noOfLines={4} spacing="3" />
              </VStack>
            ) : summary ? (
              <VStack spacing={4} align="stretch">
                {/* 1. Executive Summary */}
                <Box
                  bg="purple.50"
                  borderColor="purple.200"
                  borderWidth="1px"
                  borderRadius="lg"
                  p={3.5}
                >
                  <HStack spacing={2} mb={1.5} color="purple.800">
                    <DocumentTextIcon boxSize={4} />
                    <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase">
                      Executive Overview
                    </Text>
                  </HStack>
                  <Text fontSize="sm" color="gray.800" lineHeight="tall">
                    {summary.overview}
                  </Text>
                </Box>

                {/* 2. Key Points */}
                <Box>
                  <HStack spacing={2} mb={2} color="gray.700">
                    <ListBulletIcon boxSize={4} color="blue.600" />
                    <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase">
                      Key Discussion Points
                    </Text>
                  </HStack>
                  <VStack align="stretch" spacing={2} pl={2}>
                    {summary.keyPoints?.map((point, idx) => (
                      <HStack key={idx} align="start" spacing={2.5}>
                        <Box
                          w="5px"
                          h="5px"
                          mt="7px"
                          borderRadius="full"
                          bg="blue.500"
                          flexShrink={0}
                        />
                        <Text fontSize="sm" color="gray.700">
                          {point}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>

                <Divider />

                {/* 3. Action Items */}
                <Box>
                  <HStack spacing={2} mb={2} color="gray.700">
                    <CheckCircleSolidIcon boxSize={4} color="green.600" />
                    <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase">
                      Action Items & Decisions
                    </Text>
                  </HStack>
                  <VStack align="stretch" spacing={2} pl={2}>
                    {summary.actionItems?.map((item, idx) => (
                      <HStack key={idx} align="start" spacing={2.5}>
                        <CheckCircleSolidIcon
                          boxSize={3.5}
                          color="green.500"
                          mt="3px"
                          flexShrink={0}
                        />
                        <Text fontSize="sm" color="gray.700">
                          {item}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              </VStack>
            ) : (
              <Box py={6} textAlign="center">
                <Text fontSize="sm" color="gray.500">
                  No summary available for this conversation yet.
                </Text>
              </Box>
            )}
          </ModalBody>

          <ModalFooter bg="gray.50" borderBottomRadius="xl" py={3}>
            <HStack justify="space-between" width="100%">
              <Button
                leftIcon={<RepeatIcon />}
                size="sm"
                variant="ghost"
                onClick={fetchSummary}
                isLoading={loading}
              >
                Regenerate
              </Button>
              <HStack spacing={2}>
                <Button
                  leftIcon={<CopyIcon />}
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  isDisabled={!summary || loading}
                >
                  Copy Summary
                </Button>
                <Button size="sm" colorScheme="blue" onClick={onClose}>
                  Done
                </Button>
              </HStack>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default SummaryModal;
