import React from "react";
import { Stack } from "react-xnft";
import { HotspotListScreen } from "./HotspotList/HotspotList";
import { HotspotDetailScreen } from "./HotspotDetail";

export const HotspotsScreen = () => {
  return (
    <Stack.Navigator
      initialRoute={{ name: "list" }}
      options={({ route }) => {
        switch (route.name) {
          case "list":
            return {
              title: "Hotspots",
            };
          case "detail":
            return {
              title: "Hotspot",
            };
          default:
            throw new Error("unknown route");
        }
      }}
      style={{}}
    >
      <Stack.Screen
        name={"list"}
        component={(props: any) => <HotspotListScreen {...props} />}
      />
      <Stack.Screen
        name={"detail"}
        component={(props: any) => <HotspotDetailScreen {...props} />}
      />
    </Stack.Navigator>
  );
};
