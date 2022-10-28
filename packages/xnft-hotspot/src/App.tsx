import React from "react";
import ReactXnft, { Tab, useMetadata } from "react-xnft";
import { Flex } from "./components/common";
import { HotspotIcon, SwapIcon } from "./utils/icons";
import { HotspotsScreen } from "./components/screens/Hotspots";
import { Swap } from "./components/Swap";
import { Notification } from "./components/Notification";
import { NotificationProvider } from "./contexts/notification";
import { THEME } from "./utils/theme";
import { useColorMode } from "./utils/hooks";

//
// On connection to the host environment, warm the cache.
//
ReactXnft.events.on("connect", () => {
  // no-op
});

export const App = () => {
  const metadata = useMetadata();

  return (
    <Flex
      flexDirection="column"
      height="100%"
      width="100%"
      background={useColorMode(THEME.colors.background)}
    >
      <NotificationProvider>
        <Notification></Notification>
        <Tab.Navigator
          style={{
            background: useColorMode(THEME.colors.backgroundAccent),
            borderTop: "none",
          }}
          options={({ route }) => {
            return {
              tabBarActiveTintColor: "none",
              tabBarInactiveTintColor: "none",
              tabBarStyle: {
                backgroundColor: useColorMode(THEME.colors.backgroundAccent),
                border: "none",
              },
              tabBarIcon: ({ focused }) => {
                const color = focused
                  ? metadata.isDarkMode
                    ? THEME.colors.inactiveTab
                    : THEME.colors.activeTab
                  : metadata.isDarkMode
                  ? THEME.colors.activeTab
                  : THEME.colors.inactiveTab;

                if (route.name === "hotspots") {
                  return <Tab.Icon element={<HotspotIcon fill={color} />} />;
                } else {
                  return <Tab.Icon element={<SwapIcon fill={color} />} />;
                }
              },
            };
          }}
        >
          <Tab.Screen name="hotspots" component={() => <HotspotsScreen />} />
          <Tab.Screen name="swap" component={() => <Swap />} />
        </Tab.Navigator>
      </NotificationProvider>
    </Flex>
  );
};
