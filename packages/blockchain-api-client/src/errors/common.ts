import { z } from "zod";

/** Authentication required error */
export const UNAUTHENTICATED = {
  status: 401,
  message: "Authentication required. Please sign in to continue.",
} as const;

/** Insufficient permissions error */
export const UNAUTHORIZED = {
  status: 403,
  message: "You do not have permission to access this resource.",
} as const;

/** Resource not found error */
export const NOT_FOUND = {
  status: 404,
  message: "The requested resource was not found.",
} as const;

/** Input validation failed error */
export const BAD_REQUEST = {
  status: 400,
  message: "Invalid input data provided.",
  data: z.object({
    fields: z.array(z.string()).optional(),
  }).optional(),
} as const;

export const INVALID_WALLET_ADDRESS = {
  status: 400,
  message: "The provided wallet address is invalid.",
}

/** Rate limit exceeded error */
export const RATE_LIMITED = {
  status: 429,
  message: "Too many requests. Please try again later.",
} as const;

/** Duplicate resource error */
export const CONFLICT = {
  status: 409,
  message: "A resource with this identifier already exists.",
} as const;