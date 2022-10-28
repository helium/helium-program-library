import React from "react";
import ReactXnft, { Text, View, Stack } from "react-xnft";
import { Swap } from "./components/Swap";
import { DetailScreen } from "./components/DetailScreen";
import { GridScreen } from "./components/Grid";
import { Notification } from "./components/Notification";
import { NotificationProvider } from "./contexts/notification";
//
// On connection to the host environment, warm the cache.
//
ReactXnft.events.on("connect", () => {
  // no-op
});

export function App() {
  return (
    <View style={{ height: "100%", backgroundColor: "#111827" }}>
      <NotificationProvider>
        <Notification></Notification>
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
                  title: route.props.nft.tokenMetaUriData.name,
                };
              case "swap":
                return {
                  title: "Swap",
                };
              default:
                throw new Error("unknown route");
            }
          }}
        >

          <Stack.Screen
            name={"grid"}
            component={(props: any) => <GridScreen {...props} />}
          />
          <Stack.Screen
            name={"detail"}
            component={(props: any) => <DetailScreen {...props} />}
          />
          <Stack.Screen
            name={"swap"}
            component={(props: any) => <Swap {...props} />}
          />
        </Stack.Navigator>
      </NotificationProvider>
      
    </View>
  );
}
