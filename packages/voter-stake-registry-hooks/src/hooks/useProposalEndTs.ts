import { useProposal, useProposalConfig, useResolutionSettings } from "@helium/modular-governance-hooks";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const useProposalEndTs = (proposalKey: PublicKey) => {
  const { info: proposal } = useProposal(proposalKey);
  const { info: proposalConfig } = useProposalConfig(proposal?.proposalConfig);
  const { info: resolution } = useResolutionSettings(
    proposalConfig?.stateController
  );
  const endTs =
    resolution &&
    (proposal?.state.resolved
      ? proposal?.state.resolved.endTs
      : proposal?.state.voting?.startTs.add(
          resolution.settings.nodes.find(
            (node) => typeof node.offsetFromStartTs !== "undefined"
          )?.offsetFromStartTs?.offset ?? new BN(0)
        ));

  return endTs;
};
