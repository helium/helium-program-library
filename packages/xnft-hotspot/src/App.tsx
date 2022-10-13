import ReactXnft, { Text, View } from "react-xnft";
import { GridScreen } from './components/Grid';
//
// On connection to the host environment, warm the cache.
//
ReactXnft.events.on("connect", () => {
  // no-op
});

export function App() {
  return (
    <View>
      <GridScreen />
    </View>
  );
}
