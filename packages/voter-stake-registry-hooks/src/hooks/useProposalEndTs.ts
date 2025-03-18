import { useProposal, useProposalConfig, useResolutionSettings } from "@helium/modular-governance-hooks";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export function useProposalEndTs(proposalKey?: PublicKey) {
  const { info: proposal } = useProposal(proposalKey);
  const { info: proposalConfig } = useProposalConfig(proposal?.proposalConfig);
  const { info: resolution } = useResolutionSettings(
    proposalConfig?.stateController
  );
  return resolution &&
    // @ts-ignore
    (proposal?.state.resolved
      ? // @ts-ignore
        new BN(proposal?.state.resolved.endTs)
      : // @ts-ignore
        new BN(proposal?.state.voting?.startTs).add(
          resolution.settings.nodes.find(
            (node) => typeof node.offsetFromStartTs !== "undefined"
          )?.offsetFromStartTs?.offset ?? new BN(0)
        ));
}
