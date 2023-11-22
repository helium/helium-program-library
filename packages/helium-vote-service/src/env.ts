import dotenv from "dotenv";

dotenv.config();


export const HELIUM_VOTE_PROXY_REPO =
  process.env.HELIUM_VOTE_PROXY_REPO ||
  "https://github.com/helium/helium-vote-proxies.git";


