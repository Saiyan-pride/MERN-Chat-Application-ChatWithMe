import ScrollableFeed from "react-scrollable-feed";
import {
  isSameSender,
  isLastSender,
  isSameSenderMargin,
  isSameUser,
} from "../config/ChatLogic";
import { ChatState } from "../context/chatProvider";
import { Avatar, Tooltip } from "@chakra-ui/react";
import MarkdownMessage from "./Miscellaneous/MarkdownMessage";

function ScrollableChat({ messages }) {
  const { user } = ChatState();

  return (
    <ScrollableFeed>
      {messages &&
        messages.map((m, i) => {
          const isMe = m.sender?._id === user?._id;
          const isAi =
            m.sender?.name === "AI Assistant" ||
            m.sender?.email === "ai.assistant@chatwithme.internal";

          let bubbleBg = "#B9F5D0"; // Default received (green)
          if (isMe) {
            bubbleBg = "#BEE3F8"; // Sent by current user (blue)
          } else if (isAi) {
            bubbleBg = "#EDE9FE"; // AI Assistant response (subtle purple)
          }

          return (
            <div style={{ display: "flex" }} key={m._id}>
              {(isSameSender(messages, m, i, user._id) ||
                isLastSender(messages, i, user._id)) && (
                <Tooltip label={m.sender?.name || "User"} placement="bottom-start" hasArrow>
                  <Avatar
                    marginTop="7px"
                    marginRight={1}
                    size="sm"
                    cursor="pointer"
                    name={m.sender?.name || "User"}
                    src={m.sender?.pic}
                  />
                </Tooltip>
              )}

              <div
                style={{
                  backgroundColor: bubbleBg,
                  color: isAi ? "#2E1065" : "#1A202C",
                  marginLeft: isSameSenderMargin(messages, m, i, user._id),
                  marginTop: isSameUser(messages, m, i) ? 3 : 10,
                  borderRadius: "18px",
                  padding: "8px 16px",
                  maxWidth: "80%",
                  wordBreak: "break-word",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <MarkdownMessage content={m.content} />
              </div>
            </div>
          );
        })}
    </ScrollableFeed>
  );
}

export default ScrollableChat;
