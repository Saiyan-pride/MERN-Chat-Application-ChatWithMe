import { CloseIcon } from "@chakra-ui/icons";
import { Badge, Box } from "@chakra-ui/react";

function UserBadgeItem({ user, handleFunction }) {
  return (
    <>
      <Badge
        px={2}
        py={1}
        borderRadius="lg"
        margin={1}
        marginBottom={2}
        variant="solid"
        fontSize={12}
        colorScheme="purple"
        cursor="pointer"
        onClick={handleFunction}
      >
        {user.name}
        <CloseIcon paddingLeft={1} />
      </Badge>
    </>
  );
}

export default UserBadgeItem;
