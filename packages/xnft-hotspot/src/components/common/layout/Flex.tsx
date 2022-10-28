import React, { FC } from "react";
import { View } from "react-xnft";

type GlobalValues = "inherit" | "initial" | "revert" | "revert-layer" | "unset";

export interface FlexProps {
  display?: "flex" | "block";
  positon?: "relative" | "absolute";
  flexDirection?: "row" | "row-reverse" | "column" | "column-reverse";
  flexGrow?: number;
  flexBasis?:
    | number
    | string
    | "max-content"
    | "min-content"
    | "fit-content"
    | "content"
    | "align-items"
    | GlobalValues;
  flexShrink?: number | GlobalValues;
  flexWrap?: "nowarp" | "wrap" | "wrap-reverse" | GlobalValues;
  flex?: "auto" | "initial" | "none" | number | string | GlobalValues;
  justifyContent?:
    | "center"
    | "start"
    | "end"
    | "flex-start"
    | "flex-end"
    | "left"
    | "right"
    | "normal"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "stretch"
    | "safe center"
    | "unsafe center"
    | GlobalValues;
  alignItems?:
    | "normal"
    | "stretch"
    | "center"
    | "start"
    | "end"
    | "flex-start"
    | "flex-end"
    | "baseline"
    | "first baseline"
    | "last baseline"
    | "safe center"
    | "unsafe center"
    | GlobalValues;
  textAlign?:
    | "start"
    | "end"
    | "left"
    | "center"
    | "left"
    | "right"
    | "justify"
    | "justify-all"
    | "match-parent"
    | GlobalValues;
  gap?: string | number;
  margin?: string | number;
  mt?: string | number;
  mb?: string | number;
  my?: string | number;
  mx?: string | number;
  padding?: string | number;
  py?: string | number;
  px?: string | number;
  width?: string | number;
  height?: string | number;
  maxWidth?: string | number;
  background?: string;
  border?: string;
  borderRadius?: string | number;
  boxShadow?: string;
}

export const Flex: FC<FlexProps> = (props) => {
  const numToPx = (n: number | string): string =>
    typeof n === "number" ? `${n}px` : n;

  const numToRem = (n: number | string): string =>
    typeof n === "number" ? `${n}rem` : n;

  const margin = props.mt
    ? `${numToRem(props.mt)} 0 0 0`
    : props.mb
    ? `0 0 ${numToRem(props.mb)} 0`
    : props.my
    ? `0 ${numToRem(props.my)} 0 ${numToRem(props.my)}`
    : props.mx
    ? `${numToRem(props.mx)} 0 ${numToRem(props.mx)} 0`
    : numToRem(props.padding || "0");

  const padding = props.py
    ? `0 ${numToRem(props.py)} 0 ${numToRem(props.py)}`
    : props.px
    ? `${numToRem(props.px)} 0 ${numToRem(props.px)} 0`
    : numToRem(props.padding || "0");

  return (
    <View
      style={{
        display: props.display ? props.display : "flex",
        position: props.positon ? props.positon : "relative",
        justifyContent: props.justifyContent || "flex-start",
        flexDirection: props.flexDirection || "row",
        flexGrow: props.flexGrow || 0,
        flexBasis: props.flexBasis || "auto",
        flexShrink: props.flexShrink || 1,
        flexWrap: props.flexWrap || "nowrap",
        flex: props.flex || "0 1 auto",
        alignItems: props.alignItems || "stretch",
        gap: numToRem(props.gap || "0"),
        margin,
        padding,
        width: numToRem(props.width || "auto"),
        height: numToRem(props.height || "auto"),
        maxWidth: numToRem(props.maxWidth || "none"),
        background: props.background || "initial",
        borderRadius: numToPx(props.borderRadius || "0"),
        border: props.border || "none",
        textAlign: props.textAlign || "left",
        boxShadow: props.boxShadow || "none",
      }}
    >
      {props.children}
    </View>
  );
};
