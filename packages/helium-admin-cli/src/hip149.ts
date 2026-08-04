import { PublicKey } from "@solana/web3.js";

// The HIP 149 supplement destinations, as pinned in `helium-sub-daos::supplement`.
//
// `issue_rewards_v0` requires whatever it is handed to equal these exact keys while a supplement
// window is open, so a value that disagrees with the program fails the instruction and can never
// misroute a mint. That pin is what makes it safe to default the `end-epoch` flags to them, and
// what `create-council-fanout` checks its derived fanout account against before sending.
export const SUPPLEMENT_VAULT_TOKEN_ACCOUNT = new PublicKey(
  "AGPDcgpXan5RB2Y9usHvdJmmJHpyyYqcQm8KouRkK6f4"
);

export const COUNCIL_FANOUT_TOKEN_ACCOUNT = new PublicKey(
  "EYbAXgLq1aRr9a9y55DbjfMdXNrZuMa69WXN9c1UR6eK"
);
