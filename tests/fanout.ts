import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Fanout } from "@helium/idls/lib/types/fanout";
import {
  createAtaAndMint,
  createMint,
  createMintInstructions,
  createAtaAndTransfer,
} from "@helium/spl-utils";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import { init, membershipVoucherKey, PROGRAM_ID } from "../packages/fanout-sdk";
import { random } from "./utils/string";

describe("fanout", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<Fanout>;
  let fanoutMint: PublicKey;
  let membershipMint: PublicKey;
  let fanoutName: string;
  beforeEach(async () => {
    program = await init(provider, PROGRAM_ID, anchor.workspace.Fanout.idl);
    fanoutName = random();
    fanoutMint = await createMint(provider, 0, me);
    membershipMint = await createMint(provider, 0, me);
    await createAtaAndMint(provider, membershipMint, 100);
    await createAtaAndMint(provider, fanoutMint, 100);
  });

  it("initializes a fanout", async () => {
    const {
      pubkeys: { fanout, tokenAccount, collection },
    } = await program.methods
      .initializeFanoutV0({
        name: fanoutName,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({
        authority: provider.wallet.publicKey,
        membershipMint,
        fanoutMint,
      })
      .rpcAndKeys({ skipPreflight: true });

    const fanoutAcc = await program.account.fanoutV0.fetch(fanout!);
    expect(fanoutAcc.authority.toBase58()).to.eq(me.toBase58());
    expect(fanoutAcc.tokenAccount.toBase58()).to.eq(tokenAccount!.toBase58());
    expect(fanoutAcc.membershipCollection.toBase58()).to.eq(
      collection!.toBase58()
    );
    expect(fanoutAcc.totalShares.toNumber()).to.eq(100);
    expect(fanoutAcc.totalStakedShares.toNumber()).to.eq(0);
    expect(fanoutAcc.totalInflow.toNumber()).to.eq(0);
    expect(fanoutAcc.lastSnapshotAmount.toNumber()).to.eq(0);
    expect(fanoutAcc.name).to.eq(fanoutName);
  });

  describe("with fanout", () => {
    let fanout: PublicKey | undefined;
    let tokenAccount: PublicKey | undefined;
    beforeEach(async () => {
      ({
        pubkeys: { fanout, tokenAccount },
      } = await program.methods
        .initializeFanoutV0({
          name: fanoutName,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          authority: provider.wallet.publicKey,
          membershipMint,
          fanoutMint,
        })
        .rpcAndKeys({ skipPreflight: true }));
    });

    it("allows you to stake membership tokens", async () => {
      const recipient = Keypair.generate();
      const mint = Keypair.generate();
      const voucher = membershipVoucherKey(mint.publicKey)[0];

      const {
        pubkeys: { receiptAccount, stakeAccount },
      } = await program.methods
        .stakeV0({
          amount: new anchor.BN(10),
        })
        .preInstructions(
          await createMintInstructions(provider, 0, voucher, voucher, mint)
        )
        .accountsPartial({
          fanout,
          recipient: recipient.publicKey,
          mint: mint.publicKey,
        })
        .signers([mint])
        .rpcAndKeys({ skipPreflight: true });

      const to = await getAccount(provider.connection, receiptAccount!);
      const stake = await getAccount(provider.connection, stakeAccount!);
      expect(to.amount).to.eq(BigInt(1));
      expect(stake.amount).to.eq(BigInt(10));
      expect(to.owner.toBase58()).to.eq(recipient.publicKey.toBase58());

      const voucherAcc = await program.account.fanoutVoucherV0.fetch(voucher!);

      expect(voucherAcc.fanout.toBase58()).to.eq(fanout?.toBase58());
      expect(voucherAcc.mint.toBase58()).to.eq(to.mint.toBase58());
      expect(voucherAcc.shares.toNumber()).to.eq(10);
      expect(voucherAcc.totalInflow.toNumber()).to.eq(0);
      expect(voucherAcc.totalDistributed.toNumber()).to.eq(0);
      expect(voucherAcc.totalDust.toNumber()).to.eq(0);
    });

    describe("with staked positions", () => {
      let positions: { wallet: Keypair; mint: Keypair; amount: number }[];

      beforeEach(async () => {
        positions = [
          {
            amount: 20,
            wallet: Keypair.generate(),
            mint: Keypair.generate(),
          },
          {
            amount: 80,
            wallet: Keypair.generate(),
            mint: Keypair.generate(),
          },
        ];
        for (const { mint, wallet, amount } of positions) {
          const voucher = membershipVoucherKey(mint.publicKey)[0];

          await program.methods
            .stakeV0({
              amount: new anchor.BN(amount),
            })
            .preInstructions(
              await createMintInstructions(provider, 0, voucher, voucher, mint)
            )
            .accountsPartial({
              fanout,
              recipient: wallet.publicKey,
              mint: mint.publicKey,
            })
            .signers([mint])
            .rpc({ skipPreflight: true });
        }
      });

      it("allows you to unstake", async () => {
        const { mint, wallet, amount } = positions[0];
        const {
          pubkeys: { receiptAccount, toAccount },
        } = await program.methods
          .unstakeV0()
          .accountsPartial({
            mint: mint.publicKey,
            solDestination: provider.wallet.publicKey,
            voucherAuthority: wallet.publicKey,
          })
          .signers([wallet])
          .rpcAndKeys({ skipPreflight: true });

        const to = await getAccount(provider.connection, toAccount!);
        expect(to.amount).to.eq(BigInt(amount));

        const receipt = await provider.connection.getAccountInfo(
          receiptAccount!
        );
        expect(receipt).to.eq(null);
      });

      it("splits funds, accounting for dust", async () => {
        async function distribute() {
          for (const { wallet, mint } of positions) {
            await program.methods
              .distributeV0()
              .accountsPartial({
                fanout,
                owner: wallet.publicKey,
                mint: mint.publicKey,
              })
              .rpc({ skipPreflight: true });
          }
        }

        await createAtaAndTransfer(
          provider,
          fanoutMint,
          4,
          me,
          fanout
        );

        await distribute();

        for (const { wallet, amount } of positions) {
          const toAccount = await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(fanoutMint, wallet.publicKey)
          );
          // This first dist will ignore dust. Position 1 gets 0, position 2 gets 4.
          expect(toAccount.amount).to.eq(BigInt(Math.floor((amount / 100) * 4)));
        }

        await createAtaAndTransfer(
          provider,
          fanoutMint,
          1,
          me,
          fanout
        );

        await distribute();

        for (const { wallet, amount } of positions) {
          const toAccount = await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(fanoutMint, wallet.publicKey)
          );

          // Dust inclusive, should be a whole number
          expect(toAccount.amount).to.eq(BigInt((amount / 100) * 5));
        }
      });
    });
  });
});
