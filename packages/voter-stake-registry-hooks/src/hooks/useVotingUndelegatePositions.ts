import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init } from "@helium/nft-delegation-sdk";
import { batchLinearInstructions, sendInstructions, truthy } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useVotingUndelegatePositions = () => {
  const { provider, registrar } = useHeliumVsrState();
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

      if (isInvalid || !nftDelegationProgram || !registrar) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          const toUndelegate = (
            await nftDelegationProgram.account.delegationV0.all([
              {
                memcmp: {
                  offset: 8 + 32,
                  bytes: registrar.delegationConfig.toBase58(),
                },
              },
              {
                memcmp: {
                  offset: 8 + 32 + 32,
                  bytes: position.mint.toBase58(),
                },
              },
            ])
          ).sort((a, b) => b.account.index - a.account.index);
          let currentDelegation = toUndelegate.find((d) =>
            d.account.owner.equals(provider.wallet.publicKey)
          )?.publicKey;
          if (!currentDelegation) {
            // If no delegation found with me as the owner, must be the primary delegation
            currentDelegation = toUndelegate[toUndelegate.length - 1].publicKey
          }

          instructions.push(
            ...(
              await Promise.all(
                toUndelegate.map((delegation, index) => {
                  // Can't undelegate the 1st one (Pubkey.default)
                  if (index == toUndelegate.length - 1) {
                    return Promise.resolve(undefined);
                  }

                  const prevDelegation = toUndelegate[index + 1].publicKey;
                  return nftDelegationProgram.methods
                    .undelegateV0()
                    .accounts({
                      asset: position.mint,
                      prevDelegation,
                      currentDelegation,
                      delegation: delegation.publicKey,
                    })
                    .instruction();
                })
              )
            ).filter(truthy)
          );
        }
        await batchLinearInstructions(provider, instructions)
      }
    }
  );

  return {
    error,
    loading,
    votingUndelegatePositions: execute,
  };
};
