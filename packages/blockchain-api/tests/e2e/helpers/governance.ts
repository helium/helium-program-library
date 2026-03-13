import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { TestCtx } from "./context";
import { signAndSubmitTransactionData } from "./tx";
import { ensureFunds, ensureTokenBalance } from "./wallet";
import { getSurfpoolRpcUrl } from "./surfpool";

const EPOCH_LENGTH = 86400;
const VEHNT_LAST_CALCULATED_TS_OFFSET = 8 + 176;

export async function ensureSubDaoEpochsCurrent(
  ctx: TestCtx
): Promise<void> {
  const clockInfo = await ctx.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));
  const currentEpochStart = Math.floor(clockTimestamp / EPOCH_LENGTH) * EPOCH_LENGTH;

  for (const mint of [MOBILE_MINT, IOT_MINT]) {
    const [subDaoK] = subDaoKey(mint);
    const accountInfo = await ctx.connection.getAccountInfo(subDaoK);
    if (!accountInfo) continue;

    const lastCalcTs = Number(
      accountInfo.data.readBigInt64LE(VEHNT_LAST_CALCULATED_TS_OFFSET)
    );

    if (currentEpochStart - lastCalcTs <= EPOCH_LENGTH) continue;

    const newData = Buffer.from(accountInfo.data);
    newData.writeBigInt64LE(
      BigInt(currentEpochStart),
      VEHNT_LAST_CALCULATED_TS_OFFSET
    );

    await fetch(getSurfpoolRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "surfnet_setAccount",
        params: [
          subDaoK.toBase58(),
          {
            data: newData.toString("hex"),
            owner: accountInfo.owner.toBase58(),
            lamports: accountInfo.lamports,
          },
        ],
      }),
    });
  }
}

const DELEGATED_POSITION_EXPIRATION_TS_OFFSET = 146;

export async function setDelegatedPositionExpiration(
  ctx: TestCtx,
  delegatedPositionPubkey: PublicKey,
  newExpirationTs: number,
): Promise<void> {
  const accountInfo = await ctx.connection.getAccountInfo(delegatedPositionPubkey);
  if (!accountInfo) {
    throw new Error("DelegatedPositionV0 account not found");
  }

  const newData = Buffer.from(accountInfo.data);
  newData.writeBigInt64LE(
    BigInt(newExpirationTs),
    DELEGATED_POSITION_EXPIRATION_TS_OFFSET,
  );

  await fetch(getSurfpoolRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setAccount",
      params: [
        delegatedPositionPubkey.toBase58(),
        {
          data: newData.toString("hex"),
          owner: accountInfo.owner.toBase58(),
          lamports: accountInfo.lamports,
        },
      ],
    }),
  });
}

const POSITION_LOCKUP_END_TS_OFFSET = 80;

export async function setPositionLockupEndTs(
  ctx: TestCtx,
  positionPubkey: PublicKey,
  newEndTs: number,
): Promise<void> {
  const accountInfo = await ctx.connection.getAccountInfo(positionPubkey);
  if (!accountInfo) {
    throw new Error("PositionV0 account not found");
  }

  const newData = Buffer.from(accountInfo.data);
  newData.writeBigInt64LE(
    BigInt(newEndTs),
    POSITION_LOCKUP_END_TS_OFFSET,
  );

  await fetch(getSurfpoolRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setAccount",
      params: [
        positionPubkey.toBase58(),
        {
          data: newData.toString("hex"),
          owner: accountInfo.owner.toBase58(),
          lamports: accountInfo.lamports,
        },
      ],
    }),
  });
}

interface CreatePositionOptions {
  amount: string;
  lockupKind: "cliff" | "constant";
  lockupPeriodsInDays: number;
  subDaoMint?: PublicKey;
  automationEnabled?: boolean;
}

interface CreatePositionResult {
  positionMint: string;
  signatures: string[];
}

export async function createAndFundPosition(
  ctx: TestCtx,
  options: CreatePositionOptions
): Promise<CreatePositionResult> {
  const walletAddress = ctx.payer.publicKey.toBase58();

  // Ensure SOL balance for rent and transaction fees (~0.02 SOL per position)
  await ensureFunds(ctx.payer.publicKey, 0.1 * LAMPORTS_PER_SOL);

  // Ensure HNT balance for staking
  await ensureTokenBalance(ctx.payer.publicKey, HNT_MINT, 10);

  // Create position
  const { data, error } = await ctx.safeClient.governance.createPosition({
    walletAddress,
    tokenAmount: { amount: options.amount, mint: HNT_MINT.toBase58() },
    lockupKind: options.lockupKind,
    lockupPeriodsInDays: options.lockupPeriodsInDays,
    subDaoMint: options.subDaoMint?.toBase58(),
    automationEnabled: options.automationEnabled,
  });

  if (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error));
    throw new Error(`Failed to create position: ${msg}`);
  }

  if (!data?.transactionData?.transactions?.[0]) {
    throw new Error("No transaction returned from create position");
  }

  const signatures = await signAndSubmitTransactionData(
    ctx.connection,
    data.transactionData,
    ctx.payer
  );

  const positionMint = data.transactionData.transactions[0].metadata?.positionMint as string | undefined;
  if (!positionMint) {
    throw new Error("No positionMint in transaction metadata");
  }

  return {
    positionMint,
    signatures,
  };
}
