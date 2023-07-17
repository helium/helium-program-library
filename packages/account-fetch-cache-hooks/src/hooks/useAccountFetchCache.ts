import { useContext } from "react";
import { AccountContext } from "../contexts/accountContext";

/**
 * Get the account fetch cache to save on rcp calls. Generally, you want to use {@link useAccount}
 * @returns
 */
export const useAccountFetchCache = () => {
  const cache = useContext(AccountContext);
  if (!cache) {
    throw new Error("Account fetch cache not found. Is AccountProvider present?");
  }
  return cache;
};
