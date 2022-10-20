import React from "react";
import { Image, ImageProps, forwardRef } from "@chakra-ui/react";
import logo from "./logo.png";

export const Logo = forwardRef<ImageProps, "img">((props, ref) => {
  return <Image src={logo} ref={ref} {...props} />;
});
