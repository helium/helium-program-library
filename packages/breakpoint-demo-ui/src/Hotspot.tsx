import * as React from "react";
import {
  Flex,
  Image,
  Box,
  Button,
  useColorModeValue,
  Stack,
} from "@chakra-ui/react";
import hotspot from "./hotspot.png";

export const Hotspot: React.FC<{
  scheme?: string;
  children?: React.ReactNode;
}> = ({ scheme = "green", children }) => {
  const step1 = useColorModeValue("600", "300");
  const step2 = useColorModeValue("500", "400");
  const step3 = useColorModeValue("300", "800");

  return (
    <Stack w="full" alignItems="center" justifyContent="center">
      <Box
        as={Button}
        p={4}
        height="auto"
        bgColor={`${scheme}.${step1}`}
        color="white"
        fontWeight="medium"
        rounded="xl"
        shadow="base"
        _focus={{
          outline: "none",
        }}
        transition="background 0.8s"
        backgroundPosition="center"
        _hover={{
          bgColor: `${scheme}.${step2}`,
          bgGradient: `radial(circle, transparent 1%, ${scheme}.${step2} 1%)`,
          bgPos: "center",
          backgroundSize: "15000%",
        }}
        _active={{
          bgColor: `${scheme}.${step3}`,
          backgroundSize: "100%",
          transition: "background 0s",
        }}
      >
        <Flex
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          w={32}
        >
          <Image src={hotspot} h={32} />
          {children}
        </Flex>
      </Box>
    </Stack>
  );
};
