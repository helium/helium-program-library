import React from "react";
import { Stack } from "react-xnft";
import { Swap } from "./Swap";

export const SwapScreen = () => {
  return (
    <Stack.Navigator
      initialRoute={{ name: "swap" }}
      options={({ route }) => {
        switch (route.name) {
          case "swap":
            return {
              title: "Swap",
            };
          default:
            throw new Error("unknown route");
        }
      }}
      style={{}}
    >
      <Stack.Screen
        name={"swap"}
        component={(props: any) => <Swap {...props} />}
      />
    </Stack.Navigator>
  );
};
