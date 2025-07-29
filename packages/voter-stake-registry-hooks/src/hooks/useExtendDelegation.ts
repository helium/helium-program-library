import { BN, Program } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  delegatedPositionKey,
  init,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, SubDaoWithMeta } from "../sdk/types";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PROGRAM_ID as PROXY_PROGRAM_ID, init as initProxy } from "@helium/nft-proxy-sdk";
import { PROGRAM_ID as VSR_PROGRAM_ID, init as initVsr } from "@helium/voter-stake-registry-sdk";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
export const useExtendDelegation = () => {
  const { provider } = useHeliumVsrState();
  const now = useSolanaUnixNow(60 * 5 * 1000)
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
      onInstructions,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const isInvalid =
        !now || !provider || !provider.wallet || !position.isDelegated;
      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const hsdProgram = await init(provider as any, programId, idl);
      const proxyProgram = await initProxy(provider as any, PROXY_PROGRAM_ID, idl);
      const vsrProgram = await initVsr(provider as any, VSR_PROGRAM_ID, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to extend delegation, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];

        const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
        const delegatedPosAcc =
          await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);
        const registrarAcc = await vsrProgram.account.registrar.fetch(
          position.registrar
        );
        const proxyConfigAcc = await proxyProgram.account.proxyConfigV0.fetch(
          registrarAcc.proxyConfig
        );
        const newExpirationTs = [...(proxyConfigAcc.seasons || [])].reverse().find(
          (season) => new BN(now!).gte(season.start)
        )?.end;
        if (!newExpirationTs) {
          throw new Error("No new valid expiration ts found");
        }
        const oldExpirationTs = delegatedPosAcc.expirationTs;

        const oldSubDaoEpochInfo = subDaoEpochInfoKey(
          delegatedPosAcc.subDao,
          oldExpirationTs
        )[0];
        const newSubDaoEpochInfo = subDaoEpochInfoKey(
          delegatedPosAcc.subDao,
          newExpirationTs
        )[0];
        instructions.push(
          await hsdProgram.methods
            .extendExpirationTsV0()
            .accountsPartial({
              position: position.pubkey,
              subDao: delegatedPosAcc.subDao,
              oldClosingTimeSubDaoEpochInfo: oldSubDaoEpochInfo,
              closingTimeSubDaoEpochInfo: newSubDaoEpochInfo,
            })
            .instruction()
        );

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await sendInstructions(provider, instructions);
        }
      }
    }
  );

  return {
    error,
    loading,
    delegatePosition: execute,
  };
};
