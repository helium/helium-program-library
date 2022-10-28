import React from "react";
import { Svg, Path } from "react-xnft";

export function HotspotIcon({ fill = "#FFEFEB" }) {
  return (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <Path fill="none" d="M0 0h24v24H0z" />
      <Path
        fill={fill}
        d="M11 14v-3h2v3h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h5zM2.51 8.837C3.835 4.864 7.584 2 12 2s8.166 2.864 9.49 6.837l-1.898.632a8.003 8.003 0 0 0-15.184 0l-1.897-.632zm3.796 1.265a6.003 6.003 0 0 1 11.388 0l-1.898.633a4.002 4.002 0 0 0-7.592 0l-1.898-.633z"
      />
    </Svg>
  );
}

export function SwapIcon({ fill = "#FFEFEB" }) {
  return (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <Path fill="none" d="M0 0h24v24H0z" />
      <Path
        fill={fill}
        d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM7 9h2v4h2V9h2l-3-3.5L7 9zm10 6h-2v-4h-2v4h-2l3 3.5 3-3.5z"
      />
    </Svg>
  );
}
