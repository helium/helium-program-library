import { FC } from "react";
import { Loading } from "react-xnft";
import { Flex } from "./layout/Flex";

export interface LoadingIndicatorProps {}

export const LoadingIndicator: FC<LoadingIndicatorProps> = () => (
  <Flex container flexDirection="column" justifyContent="center" height="100%">
    <Loading
      style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
    />
  </Flex>
);
