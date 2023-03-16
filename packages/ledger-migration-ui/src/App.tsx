import {
  ChakraProvider,
  Container, extendTheme, HStack, theme
} from "@chakra-ui/react";
import { StepsTheme as Steps } from "chakra-ui-steps";
import { Migration } from "./Migration";

const myTheme = extendTheme({
  ...theme,
  components: {
    Steps,
  },
});

export const App = () => {

  return (
    <ChakraProvider theme={myTheme}>
      <Container m="0 auto" maxW="xl" pt={8}>
        <HStack w="full">
          <Migration />
        </HStack>
      </Container>
    </ChakraProvider>
  );
};
