import React from "react";
import { Stack } from "react-xnft";
import { HotspotGridScreen } from "./HotspotGrid/HotspotGrid";
import { HotspotDetailScreen } from "./HotspotDetail";
import { THEME } from "../../../utils/theme";

export const HotspotsScreen = () => (
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
    style={{
      font: "Inter",
      fontSize: "20px",
      fontWeight: "700",
      color: THEME.colors.black,
      backdropFilter: "blur(10px)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      height: "56px",
    }}
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
