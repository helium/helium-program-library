import React from "react";
import { Stack } from "react-xnft";
import { HotspotGridScreen } from "./HotspotGrid/HotspotGrid";
import { HotspotDetailScreen } from "./HotspotDetail";
import { THEME } from "../../../utils/theme";
import { useColorMode } from "../../../utils/hooks";

export const HotspotsScreen = () => {
  return (
    <Stack.Navigator
      initialRoute={{ name: "grid" }}
      options={({ route }) => {
        switch (route.name) {
          case "grid":
            return {
              title: "My Hotspots",
            };
          case "detail":
            return {
              title: "My Details",
            };
          default:
            throw new Error("unknown route");
        }
      }}
      style={{}}
    >
      <Stack.Screen
        name={"grid"}
        component={(props: any) => <HotspotGridScreen {...props} />}
      />
      <Stack.Screen
        name={"detail"}
        component={(props: any) => <HotspotDetailScreen {...props} />}
      />
    </Stack.Navigator>
  );
};
