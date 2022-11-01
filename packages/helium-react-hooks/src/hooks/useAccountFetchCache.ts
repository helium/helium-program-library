import { useContext } from "react";
import { AccountContext } from "../contexts/accountContext";

/**
 * Get the Strata account fetch cache to save on rcp calls. Generally, you want to use {@link useAccount}
 * @returns
 */
export const useAccountFetchCache = () => {
  return useContext(AccountContext);
};
