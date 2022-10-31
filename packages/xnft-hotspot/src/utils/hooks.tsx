import { useEffect, useState } from "react";
import { useMetadata, useNavigation } from "react-xnft";

export const useColorMode = ({
  light,
  dark,
}: {
  light: string;
  dark: string;
}): string => {
  const metadata = useMetadata();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (metadata) {
      metadata.isDarkMode ? setValue(dark) : setValue(light);
    }
  }, [metadata, setValue]);

  return value;
};

export const useTitleColor = () => {
  const nav = useNavigation();
  const textColor = useColorMode({
    light: "#333333",
    dark: "#ffffff",
  });

  useEffect(() => {
    nav.setTitleStyle({
      color: textColor,
    });
  }, [nav]);
};
