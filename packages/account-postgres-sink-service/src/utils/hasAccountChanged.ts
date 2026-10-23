import deepEqual from "deep-equal";
import _omit from "lodash/omit";
import { OMIT_KEYS } from "../constants";

// Loose compare on purpose: raw rows return DECIMAL columns as strings ("5")
// while decoded accounts hold numbers (5). A strict compare would flag every
// such row as changed and republish it on each refresh.
export const hasAccountChanged = (
  newRecord: Record<string, any>,
  existingRecord: Record<string, any> | undefined,
) =>
  !existingRecord ||
  !deepEqual(_omit(newRecord, OMIT_KEYS), _omit(existingRecord, OMIT_KEYS));
