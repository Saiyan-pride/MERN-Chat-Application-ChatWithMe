import { Box } from "@chakra-ui/react";
import SideDrawers from "../components/Miscellaneous/SideDrawers";

import { ChatState } from "../context/chatProvider";
import MyChats from "../components/MyChats";
import ChatBox from "../components/ChatBox";

function ChatPage() {
  const { user } = ChatState();
  return (
    <div style={{ width: "100%" }}>
      {user && <SideDrawers />}
      <Box
        display="flex"
        justifyContent="space-between"
        width="100%"
        height="91.5vh"
        p="10px"
      >
        {user && <MyChats />}
        {user && <ChatBox />}
      </Box>
    </div>
  );
}

export default ChatPage;
