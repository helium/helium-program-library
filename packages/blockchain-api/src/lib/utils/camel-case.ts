function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepCamelCaseKeys<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCamelCaseKeys(item)) as unknown as T;
  }
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toCamelCase(key)] = deepCamelCaseKeys(value);
    }
    return result as T;
  }
  return obj;
}
