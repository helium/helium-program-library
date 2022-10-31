import React, { FC } from "react";
import { View, Loading } from "react-xnft";

export interface LoadingIndicatorProps {}

export const LoadingIndicator: FC<LoadingIndicatorProps> = () => (
  <View tw="flex flex-col justify-center h-full w-full">
    <Loading
      style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
    />
  </View>
);
