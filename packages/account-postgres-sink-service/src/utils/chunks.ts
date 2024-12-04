export const chunks = <T>(array: readonly T[], size: number): T[][] =>
  Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size)
  );
