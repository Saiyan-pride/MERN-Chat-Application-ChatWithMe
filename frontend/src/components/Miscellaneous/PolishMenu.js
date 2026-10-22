import {
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { useState } from "react";
import axios from "axios";
import { ChatState } from "../../context/chatProvider";
import {
  SparklesIcon,
  BriefcaseIcon,
  SmileIcon,
  BoltIcon,
  SpellcheckIcon,
} from "./AiIcons";

function PolishMenu({ draftText, onApplyPolish }) {
  const { user } = ChatState();
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handlePolish = async (tone) => {
    if (!draftText || !draftText.trim()) {
      toast({
        title: "No Draft to Polish",
        description: "Type a message first to polish its tone or grammar.",
        status: "info",
        duration: 3000,
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
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.post(
        "/api/ai/polish",
        { text: draftText, tone },
        config
      );

      if (data.polishedText) {
        onApplyPolish(data.polishedText);
        toast({
          title: "Message Polished",
          description: `Applied ${tone} tone to your draft.`,
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "top",
        });
      }
      setLoading(false);
    } catch (err) {
      toast({
        title: "Polish Failed",
        description:
          err.response?.data?.message || "Could not rephrase draft at this time.",
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "top",
      });
      setLoading(false);
    }
  };

  return (
    <Menu isLazy>
      <Tooltip label="Polish message with AI" placement="top" hasArrow>
        <MenuButton
          as={IconButton}
          aria-label="Polish tone"
          icon={loading ? <Spinner size="xs" /> : <SparklesIcon color="purple.500" boxSize={4} />}
          size="sm"
          variant="ghost"
          isDisabled={loading}
          mr={1}
          _hover={{ bg: "purple.50" }}
        />
      </Tooltip>
      <MenuList shadow="lg" borderRadius="lg" minW="180px">
        <MenuItem
          icon={<BriefcaseIcon color="blue.600" boxSize={4} />}
          onClick={() => handlePolish("professional")}
          fontSize="sm"
        >
          Professional
        </MenuItem>
        <MenuItem
          icon={<SmileIcon color="amber.600" boxSize={4} />}
          onClick={() => handlePolish("friendly")}
          fontSize="sm"
        >
          Friendly
        </MenuItem>
        <MenuItem
          icon={<BoltIcon color="purple.600" boxSize={4} />}
          onClick={() => handlePolish("concise")}
          fontSize="sm"
        >
          Concise
        </MenuItem>
        <MenuItem
          icon={<SpellcheckIcon color="green.600" boxSize={4} />}
          onClick={() => handlePolish("grammar")}
          fontSize="sm"
        >
          Fix Grammar
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

export default PolishMenu;
