export const flattenAndLimitSubArrays = <T>(
  multiDimArray: T[][],
  maxItems: number
): T[][] => {
  const result: T[][] = [];
  let currentBucket: T[] = [];

  for (const subArray of multiDimArray) {
    // If the current sub-array itself is larger than maxItems, we need to split it
    if (subArray.length > maxItems) {
      if (currentBucket.length > 0) {
        result.push(currentBucket);
        currentBucket = [];
      }
      for (let i = 0; i < subArray.length; i += maxItems) {
        result.push(subArray.slice(i, i + maxItems));
      }
      continue;
    }

    // Check if adding the current sub-array would exceed maxItems in the current bucket
    if (currentBucket.length + subArray.length > maxItems) {
      result.push(currentBucket);
      currentBucket = [];
    }

    currentBucket.push(...subArray);
  }

  // Add the last bucket if it has any items
  if (currentBucket.length > 0) {
    result.push(currentBucket);
  }

  return result;
};
