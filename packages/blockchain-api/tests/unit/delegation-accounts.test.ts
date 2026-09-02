import { EPOCH_LENGTH, subDaoEpochInfoKey } from "@helium/helium-sub-daos-sdk";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PROGRAM_ID as VSR_PROGRAM_ID } from "@helium/voter-stake-registry-sdk";
import BN from "bn.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  changeDelegationAccounts,
  closeDelegationAccounts,
  delegateAccounts,
  extendExpirationAccounts,
} from "../../src/server/api/routers/governance/procedures/helpers/delegation-accounts";

const epochStart = (epoch: number) => new BN(epoch * EPOCH_LENGTH);

const wallet = Keypair.generate().publicKey;
const position = Keypair.generate().publicKey;
const positionMint = Keypair.generate().publicKey;
const registrar = Keypair.generate().publicKey;
const proxyConfig = Keypair.generate().publicKey;
const dao = Keypair.generate().publicKey;
const delegatedPosition = Keypair.generate().publicKey;
const subDao = Keypair.generate().publicKey;
const oldSubDao = Keypair.generate().publicKey;

// Epochs chosen so every branch lands on a distinct epoch: the lockup outlives
// the season, which outlives the genesis end, which outlives the delegation's
// expiration.
const LOCKUP_END = epochStart(1000).addn(100);
const SEASON_END = epochStart(980).addn(3);
const GENESIS_END = epochStart(950).addn(10);
const EXPIRATION = epochStart(900).addn(50);
const NOW = epochStart(800).addn(7);

const base = {
  wallet,
  position,
  positionMint,
  lockupEndTs: LOCKUP_END,
  genesisEndTs: GENESIS_END,
  registrar,
  proxyConfig,
  dao,
  delegatedPosition,
  subDao,
  now: NOW,
};

const epochInfo = (sub: PublicKey, epoch: number) =>
  subDaoEpochInfoKey(sub, epochStart(epoch))[0].toBase58();

describe("closeDelegationAccounts", () => {
  it("keys the closing epoch off the delegation's expiration", () => {
    const accounts = closeDelegationAccounts({
      ...base,
      expirationTs: EXPIRATION,
    });

    expect(accounts.subDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 800),
    );
    expect(accounts.closingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 900),
    );
    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 950),
    );
  });

  it("supplies every account the program declares", () => {
    const accounts = closeDelegationAccounts({
      ...base,
      expirationTs: EXPIRATION,
    });

    expect(accounts.payer.toBase58()).to.equal(wallet.toBase58());
    expect(accounts.positionAuthority.toBase58()).to.equal(wallet.toBase58());
    expect(accounts.mint.toBase58()).to.equal(positionMint.toBase58());
    expect(accounts.positionTokenAccount.toBase58()).to.equal(
      getAssociatedTokenAddressSync(positionMint, wallet, true).toBase58(),
    );
    expect(accounts.vsrProgram.toBase58()).to.equal(VSR_PROGRAM_ID.toBase58());
    expect(accounts.systemProgram.toBase58()).to.equal(
      SystemProgram.programId.toBase58(),
    );
  });

  it("falls back to the lockup end when the delegation never expires", () => {
    const accounts = closeDelegationAccounts({
      ...base,
      expirationTs: new BN(0),
    });

    expect(accounts.closingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 1000),
    );
  });

  it("reuses the closing epoch once the genesis end has passed", () => {
    const accounts = closeDelegationAccounts({
      ...base,
      now: epochStart(960).addn(5),
      expirationTs: EXPIRATION,
    });

    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 900),
    );
  });
});

describe("delegateAccounts", () => {
  it("keys the closing epoch off the season end", () => {
    const accounts = delegateAccounts({ ...base, seasonEndTs: SEASON_END });

    expect(accounts.subDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 800),
    );
    expect(accounts.closingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 980),
    );
    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 950),
    );
    expect(accounts.proxyConfig.toBase58()).to.equal(proxyConfig.toBase58());
  });

  it("reuses the closing epoch once the genesis end has passed", () => {
    const accounts = delegateAccounts({
      ...base,
      now: epochStart(960).addn(5),
      seasonEndTs: SEASON_END,
    });

    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 980),
    );
  });
});

describe("changeDelegationAccounts", () => {
  it("keys the old epochs off the old sub-DAO and expiration", () => {
    const accounts = changeDelegationAccounts({
      ...base,
      oldSubDao,
      expirationTs: EXPIRATION,
      seasonEndTs: SEASON_END,
    });

    expect(accounts.oldSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(oldSubDao, 800),
    );
    expect(accounts.oldClosingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(oldSubDao, 900),
    );
    expect(accounts.oldGenesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(oldSubDao, 950),
    );
  });

  it("keys the new epochs off the target sub-DAO and season end", () => {
    const accounts = changeDelegationAccounts({
      ...base,
      oldSubDao,
      expirationTs: EXPIRATION,
      seasonEndTs: SEASON_END,
    });

    expect(accounts.subDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 800),
    );
    expect(accounts.closingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 980),
    );
    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 950),
    );
  });
});

describe("extendExpirationAccounts", () => {
  it("moves the closing epoch from the old expiration to the season end", () => {
    const accounts = extendExpirationAccounts({
      ...base,
      expirationTs: EXPIRATION,
      seasonEndTs: SEASON_END,
    });

    expect(accounts.oldClosingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 900),
    );
    expect(accounts.closingTimeSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 980),
    );
    expect(accounts.genesisEndSubDaoEpochInfo.toBase58()).to.equal(
      epochInfo(subDao, 950),
    );
  });

  it("signs with the position token account owner rather than a position authority", () => {
    const accounts = extendExpirationAccounts({
      ...base,
      expirationTs: EXPIRATION,
      seasonEndTs: SEASON_END,
    });

    expect(accounts.authority.toBase58()).to.equal(wallet.toBase58());
  });
});
