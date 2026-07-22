import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import BN from "bn.js";
import { getCurrentSeasonEnd } from "../../../src/server/api/routers/governance/procedures/helpers/get-current-season";
import { TestCtx } from "./context";
import { signAndSubmitTransactionData } from "./tx";
import { ensureFunds, ensureTokenBalance } from "./wallet";
import { getSurfpoolRpcUrl } from "./surfpool";

/**
 * Initialize Anchor programs for on-chain state verification
 */
export async function getPrograms(ctx: TestCtx) {
  const wallet = new Wallet(ctx.payer);
  const provider = new AnchorProvider(
    ctx.connection,
    wallet,
    AnchorProvider.defaultOptions(),
  );

  const vsrProgram = await initVsr(provider);
  const hsdProgram = await initHsd(provider);
  const proxyProgram = await initProxy(provider);

  return { vsrProgram, hsdProgram, proxyProgram, provider };
}

const PROXY_ASSIGNMENT_DURATION_SECONDS = 86400 * 90;
const PROXY_EXPIRATION_BUFFER_SECONDS = 60;

/** Proxy assignments must expire within the current proxy season. */
export async function getSeasonBoundedProxyExpirationTime(
  ctx: TestCtx,
  positionMint: string,
): Promise<number> {
  const { vsrProgram, proxyProgram } = await getPrograms(ctx);
  const now = Math.floor(Date.now() / 1000);
  const [positionPubkey] = positionKey(new PublicKey(positionMint));
  const positionAcc = await vsrProgram.account.positionV0.fetch(positionPubkey);
  const registrar = await vsrProgram.account.registrar.fetch(
    positionAcc.registrar,
  );
  const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
    registrar.proxyConfig,
  );
  const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, new BN(now));

  if (!seasonEnd) {
    throw new Error("No current proxy season found");
  }

  const maxExpiration = seasonEnd.toNumber() - PROXY_EXPIRATION_BUFFER_SECONDS;
  if (maxExpiration <= now) {
    throw new Error("Current proxy season has already ended");
  }

  return Math.min(now + PROXY_ASSIGNMENT_DURATION_SECONDS, maxExpiration);
}

const EPOCH_LENGTH = 86400;
const VEHNT_LAST_CALCULATED_TS_OFFSET = 8 + 176;

export async function ensureSubDaoEpochsCurrent(ctx: TestCtx): Promise<void> {
  const clockInfo = await ctx.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));
  const currentEpochStart =
    Math.floor(clockTimestamp / EPOCH_LENGTH) * EPOCH_LENGTH;

  for (const mint of [MOBILE_MINT, IOT_MINT]) {
    const [subDaoK] = subDaoKey(mint);
    const accountInfo = await ctx.connection.getAccountInfo(subDaoK);
    if (!accountInfo) continue;

    const lastCalcTs = Number(
      accountInfo.data.readBigInt64LE(VEHNT_LAST_CALCULATED_TS_OFFSET),
    );

    if (currentEpochStart - lastCalcTs <= EPOCH_LENGTH) continue;

    const newData = Buffer.from(accountInfo.data);
    newData.writeBigInt64LE(
      BigInt(currentEpochStart),
      VEHNT_LAST_CALCULATED_TS_OFFSET,
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
  const accountInfo = await ctx.connection.getAccountInfo(
    delegatedPositionPubkey,
  );
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
  newData.writeBigInt64LE(BigInt(newEndTs), POSITION_LOCKUP_END_TS_OFFSET);

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
  options: CreatePositionOptions,
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
    const msg =
      error instanceof Error
        ? error.message
        : JSON.stringify(error, Object.getOwnPropertyNames(error));
    throw new Error(`Failed to create position: ${msg}`);
  }

  if (!data?.transactionData?.transactions?.[0]) {
    throw new Error("No transaction returned from create position");
  }

  const signatures = await signAndSubmitTransactionData(
    ctx.connection,
    data.transactionData,
    ctx.payer,
  );

  const positionMint = data.transactionData.transactions[0].metadata
    ?.positionMint as string | undefined;
  if (!positionMint) {
    throw new Error("No positionMint in transaction metadata");
  }

  return {
    positionMint,
    signatures,
  };
}
