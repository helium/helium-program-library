import { BN } from "@coral-xyz/anchor";
import { sendInstructions } from "@helium/spl-utils";
import { getRegistrarKey, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { HeliumVsrClient } from "../sdk/client";
import { SubDaoWithMeta } from "../sdk/types";
import {
  daoKey,
  init as initHsd,
  subDaoEpochInfoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { INDEXER_WAIT } from "../constants";

const SECS_PER_DAY = 86400;
export const useCreatePosition = () => {
  const { provider } = useHeliumVsrState();
  const { result: client } = useAsync(
    (provider) => HeliumVsrClient.connect(provider),
    [provider]
  );
  const queryClient = useQueryClient();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      amount,
      lockupKind = { cliff: {} },
      lockupPeriodsInDays,
      mint,
      subDao,
      onInstructions,
    }: {
      amount: BN;
      lockupKind: any;
      lockupPeriodsInDays: number;
      mint: PublicKey;
      subDao?: SubDaoWithMeta;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[],
        signers: Keypair[]
      ) => Promise<void>;
    }) => {
      const isInvalid = !provider || !client;

      if (isInvalid) {
        throw new Error("Unable to Create Position, Invalid params");
      } else {
        const hsdProgram = await initHsd(provider);
        const [daoK] = daoKey(mint);
        const [subDaoK] = subDaoKey(mint);
        const myDao = await hsdProgram.account.daoV0.fetchNullable(daoK);
        const mySubDao = await hsdProgram.account.subDaoV0.fetchNullable(subDaoK);
        const registrar = (mySubDao?.registrar || myDao?.registrar)!;
        const mintKeypair = Keypair.generate();
        const position = positionKey(mintKeypair.publicKey)[0];
        const instructions: TransactionInstruction[] = [];
        const delegateInstructions: TransactionInstruction[] = [];
        const mintRent =
          await provider.connection.getMinimumBalanceForRentExemption(
            MintLayout.span
          );

        instructions.push(
          SystemProgram.createAccount({
            fromPubkey: provider.wallet!.publicKey!,
            newAccountPubkey: mintKeypair.publicKey,
            lamports: mintRent,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID,
          })
        );

        instructions.push(
          createInitializeMintInstruction(
            mintKeypair.publicKey,
            0,
            position,
            position
          )
        );

        instructions.push(
          await client.program.methods
            .initializePositionV0({
              kind: { [lockupKind]: {} },
              periods: lockupPeriodsInDays,
            } as any)
            .accounts({
              registrar,
              mint: mintKeypair.publicKey,
              depositMint: mint,
              recipient: provider.wallet!.publicKey!,
            })
            .instruction()
        );

        instructions.push(
          await client.program.methods
            .depositV0({
              amount,
            })
            .accounts({
              registrar,
              position,
              mint,
            })
            .instruction()
        );

        if (subDao) {
          const clock = await provider.connection.getAccountInfo(
            SYSVAR_CLOCK_PUBKEY
          );
          const unixTime = clock!.data.readBigInt64LE(8 * 4);
          const registrarAcc = await client.program.account.registrar.fetch(
            registrar
          );
          const currTs = Number(unixTime) + registrarAcc.timeOffset.toNumber();
          const endTs = lockupPeriodsInDays * SECS_PER_DAY + currTs;
          const [subDaoEpochInfo] = subDaoEpochInfoKey(subDao.pubkey, currTs);
          const [endSubDaoEpochInfoKey] = subDaoEpochInfoKey(
            subDao.pubkey,
            endTs
          );

          delegateInstructions.push(
            await hsdProgram.methods
              .delegateV0()
              .accounts({
                position,
                mint: mintKeypair.publicKey,
                registrar,
                subDao: subDao.pubkey,
                dao: subDao.dao,
                subDaoEpochInfo: subDaoEpochInfo,
                closingTimeSubDaoEpochInfo: endSubDaoEpochInfoKey,
                genesisEndSubDaoEpochInfo: endSubDaoEpochInfoKey,
              })
              .instruction()
          );
        }

        if (onInstructions) {
          await onInstructions(
            [...instructions, ...delegateInstructions],
            [mintKeypair]
          );
        } else {
          await sendInstructions(provider, instructions, [mintKeypair]);
          if (delegateInstructions.length > 0) {
            await sendInstructions(provider, delegateInstructions);
          }
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
    createPosition: execute,
  };
};
