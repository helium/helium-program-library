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
  const metadata = useMetadata();

  useEffect(() => {
    if (!metadata || !nav) return;

    nav.setTitleStyle({
      color: metadata.isDarkMode ? "#ffffff" : "#333333",
    });
  }, [metadata.isDarkMode]);
};
