import { useAnchorProvider } from "@helium/helium-react-hooks";
import {
  bulkSendTransactions,
  chunks
} from "@helium/spl-utils";
import { init } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@metaplex-foundation/js";
import { Transaction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";

export const useVote = () => {
  const provider = useAnchorProvider();
  const { positions } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({ choice, proposal }: { choice: number; proposal: PublicKey }) => {
      const isInvalid = !provider || !positions || positions.length === 0;

      if (isInvalid) {
        throw new Error(
          "Unable to vote without positions. Please stake tokens first."
        );
      } else {
        const vsrProgram = await init(provider);
        const instructions = await Promise.all(
          positions.map(async (position) => {
            return await vsrProgram.methods
              .voteV0({
                choice,
              })
              .accounts({
                proposal,
                voter: provider.wallet.publicKey,
                position: position.pubkey,
              })
              .instruction();
          })
        );

        const txs = chunks(instructions, 4).map((ixs) => {
          const tx = new Transaction({
            feePayer: provider.wallet.publicKey,
          });
          tx.add(...ixs);

          return tx;
        });

        await bulkSendTransactions(provider, txs);
      }
    }
  );

  return {
    error,
    loading,
    createPosition: execute,
  };
};
