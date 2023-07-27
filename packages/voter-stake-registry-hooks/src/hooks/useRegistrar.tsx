import { useAnchorAccount } from "@helium/helium-react-hooks";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { PublicKey } from "@solana/web3.js";

export const useRegistrar = (registrarKey: PublicKey | undefined) =>
  useAnchorAccount<VoterStakeRegistry, "registrar">(registrarKey, "registrar");