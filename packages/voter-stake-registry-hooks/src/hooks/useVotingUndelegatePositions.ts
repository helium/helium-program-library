import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, delegationKey, init } from "@helium/nft-delegation-sdk";
import {
  batchLinearInstructions,
  sendInstructions,
  truthy,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useVotingUndelegatePositions = () => {
  const { provider, registrar, voteService, refetch } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      programId = PROGRAM_ID,
    }: {
      positions: PositionWithMeta[];
      programId?: PublicKey;
    }) => {
      const isInvalid = !provider;

      const idl = await Program.fetchIdl(programId, provider);
      const nftDelegationProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !nftDelegationProgram || !registrar || !voteService) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          let currentDelegation = delegationKey(
            registrar.delegationConfig,
            position.mint,
            provider.wallet.publicKey
          )[0];
          let delegation =
            await nftDelegationProgram.account.delegationV0.fetchNullable(
              currentDelegation
            );
          if (!delegation) {
            currentDelegation = delegationKey(
              registrar.delegationConfig,
              position.mint,
              PublicKey.default
            )[0];
            delegation = await nftDelegationProgram.account.delegationV0.fetch(
              currentDelegation
            );
          }
          const toUndelegate = await voteService.getDelegationsForWallet(
            position.pubkey,
            delegation.index
          );

          instructions.push(
            ...(
              await Promise.all(
                toUndelegate.map((delegation, index) => {
                  // Can't undelegate the 1st one (Pubkey.default)
                  if (index == toUndelegate.length - 1) {
                    return Promise.resolve(undefined);
                  }

                  const prevDelegation = new PublicKey(
                    toUndelegate[index + 1].address
                  );
                  return nftDelegationProgram.methods
                    .undelegateV0()
                    .accounts({
                      asset: position.mint,
                      prevDelegation,
                      currentDelegation,
                      delegation: new PublicKey(delegation.address),
                    })
                    .instruction();
                })
              )
            ).filter(truthy)
          );
        }
        await batchLinearInstructions(provider, instructions);
        // Wait a couple seconds for changes to hit pg-sink
        setTimeout(refetch, 2 * 1000);
      }
    }
  );

  return {
    error,
    loading,
    votingUndelegatePositions: execute,
  };
};
