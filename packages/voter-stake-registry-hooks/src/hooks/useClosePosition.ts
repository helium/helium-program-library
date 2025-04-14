import { BN } from "@coral-xyz/anchor";
import { sendInstructions } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import { TransactionInstruction } from "@solana/web3.js";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { HeliumVsrClient } from "../sdk/client";
import { PositionWithMeta } from "../sdk/types";
import { useQueryClient } from "@tanstack/react-query";
import { INDEXER_WAIT } from "../constants";

export const useClosePosition = () => {
  const { provider, unixNow } = useHeliumVsrState();
  const { result: client } = useAsync(
    (provider) => HeliumVsrClient.connect(provider),
    [provider]
  );
  const queryClient = useQueryClient();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      onInstructions,
    }: {
      position: PositionWithMeta;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const lockup = position.lockup;
      const lockupKind = Object.keys(lockup.kind)[0];
      const isInvalid =
        !provider ||
        !client ||
        !(client instanceof HeliumVsrClient) ||
        position.numActiveVotes > 0 ||
        // lockupExpired
        !(
          lockupKind !== "constant" &&
          lockup.endTs.sub(new BN(unixNow!)).lt(new BN(0))
        );

      if (loading) return;

      if (isInvalid) {
        throw new Error("Unable to Close Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];

        const registrar = await client.program.account.registrar.fetch(
          position.registrar
        );
        instructions.push(
          await client.program.methods
            .withdrawV0({
              amount: position.amountDepositedNative,
            })
            .accountsPartial({
              position: position.pubkey,
              depositMint:
                registrar.votingMints[position.votingMintConfigIdx].mint,
            })
            .instruction()
        );

        instructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            provider.wallet.publicKey,
            getAssociatedTokenAddressSync(
              position.votingMint.mint,
              provider.wallet.publicKey,
              true
            ),
            provider.wallet.publicKey,
            position.votingMint.mint
          )
        );

        instructions.push(
          await client.program.methods
            .closePositionV0()
            .accountsPartial({
              position: position.pubkey,
            })
            .instruction()
        );

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await sendInstructions(provider, instructions);
        }

        // Give some time for indexers
        setTimeout(async () => {
          try {
            await queryClient.invalidateQueries({
              queryKey: ["positionKeys"],
            });
          } catch (e: any) {
            console.error("Exception invalidating queries", e);
          }
        }, INDEXER_WAIT);
      }
    }
  );

  return {
    error,
    loading,
    closePosition: execute,
  };
};
