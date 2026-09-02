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
import {
  fanoutKey,
  init,
  membershipVoucherKey,
  PROGRAM_ID,
} from "../packages/fanout-sdk";
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

  it("refuses a fanout whose membership mint has no supply", async () => {
    const emptyMint = await createMint(provider, 0, me);

    let err: any;
    try {
      await program.methods
        .initializeFanoutV0({ name: random() })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          authority: me,
          membershipMint: emptyMint,
          fanoutMint,
        })
        .rpc({ skipPreflight: false });
    } catch (e: any) {
      err = e;
    }

    expect(err, "a fanout with no shares was accepted").to.not.eq(undefined);
    expect(err.error?.errorCode?.code).to.eq("NoShares");
  });

  it("pays a balance that was in the vault before creation", async () => {
    const name = random();
    const fanout = fanoutKey(name)[0];
    // Funded before the fanout exists, so the accumulator has to start empty
    // for anyone to ever be owed it.
    await createAtaAndMint(provider, fanoutMint, 100, fanout);

    await program.methods
      .initializeFanoutV0({ name })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({ authority: me, membershipMint, fanoutMint })
      .rpc({ skipPreflight: true });

    const wallet = Keypair.generate();
    const mint = Keypair.generate();
    const voucher = membershipVoucherKey(mint.publicKey)[0];
    await program.methods
      .stakeV0({ amount: new anchor.BN(100) })
      .preInstructions(
        await createMintInstructions(provider, 0, voucher, voucher, mint)
      )
      .accountsPartial({ fanout, recipient: wallet.publicKey, mint: mint.publicKey })
      .signers([mint])
      .rpc({ skipPreflight: true });

    await program.methods
      .distributeV0()
      .accountsPartial({ fanout, owner: wallet.publicKey, mint: mint.publicKey })
      .rpc({ skipPreflight: true });

    const paid = await getAccount(
      provider.connection,
      getAssociatedTokenAddressSync(fanoutMint, wallet.publicKey)
    );
    expect(paid.amount).to.eq(BigInt(100));
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

    async function stake(
      mint: Keypair,
      recipient: PublicKey,
      amount: number,
      opts: { staker?: Keypair; skipPreflight?: boolean } = {}
    ): Promise<void> {
      const { staker, skipPreflight = true } = opts;
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
          recipient,
          mint: mint.publicKey,
          ...(staker ? { staker: staker.publicKey } : {}),
        })
        .signers(staker ? [mint, staker] : [mint])
        .rpc({ skipPreflight });
    }

    async function distribute(mint: Keypair, owner: PublicKey): Promise<void> {
      await program.methods
        .distributeV0()
        .accountsPartial({
          fanout,
          owner,
          mint: mint.publicKey,
        })
        .rpc({ skipPreflight: true });
    }

    async function balanceOf(
      mint: PublicKey,
      owner: PublicKey
    ): Promise<bigint> {
      const account = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(mint, owner)
      );
      return account.amount;
    }

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

    it("refuses a stake beyond the fanout's total shares", async () => {
      const mint = Keypair.generate();
      const recipient = Keypair.generate();

      // total_shares is the membership supply at creation, which is 100.
      await createAtaAndMint(provider, membershipMint, 1);

      let err: any;
      try {
        // Keep preflight on: a preflight failure surfaces as an AnchorError
        // with code and logs, while a post-send confirmation failure races
        // anchor's getTransaction log fetch and can come back as an opaque
        // SendTransactionError with neither.
        await stake(mint, recipient.publicKey, 101, { skipPreflight: false });
      } catch (e: any) {
        err = e;
      }

      expect(err, "stake of 101 was accepted").to.not.eq(undefined);
      expect(err.error?.errorCode?.code).to.eq("TooManyShares");
    });

    it("refuses a stake of zero shares", async () => {
      let err: any;
      try {
        await stake(Keypair.generate(), me, 0, { skipPreflight: false });
      } catch (e: any) {
        err = e;
      }

      expect(err, "a zero stake was accepted").to.not.eq(undefined);
      expect(err.error?.errorCode?.code).to.eq("ZeroStake");
    });

    it("refuses a distribution whose destination is the vault", async () => {
      const mint = Keypair.generate();
      // The receipt has to sit in an account owned by the fanout for `owner` to
      // validate, so mint it straight to the fanout PDA.
      await stake(mint, fanout!, 100);

      let err: any;
      try {
        await program.methods
          .distributeV0()
          .accountsPartial({ fanout, owner: fanout!, mint: mint.publicKey })
          .rpc({ skipPreflight: false });
      } catch (e: any) {
        err = e;
      }

      expect(err, "distribute to the vault was accepted").to.not.eq(undefined);
      expect(err.error?.errorCode?.code).to.eq("InvalidDestination");
    });

    it("pays a balance that arrived before the first stake to the first staker", async () => {
      const member = { wallet: Keypair.generate(), mint: Keypair.generate() };

      // Nothing is staked, so there is no share count to scale this by and it
      // waits for the first fold.
      await createAtaAndMint(provider, fanoutMint, 100, fanout!);
      await stake(member.mint, member.wallet.publicKey, 100);
      await distribute(member.mint, member.wallet.publicKey);
      expect(await balanceOf(fanoutMint, member.wallet.publicKey)).to.eq(
        BigInt(100)
      );

      await createAtaAndMint(provider, fanoutMint, 40, fanout!);
      await distribute(member.mint, member.wallet.publicKey);
      expect(await balanceOf(fanoutMint, member.wallet.publicKey)).to.eq(
        BigInt(140)
      );
    });

    it("pays a vault balance to the shares staked when it arrived", async () => {
      const early = { wallet: Keypair.generate(), mint: Keypair.generate() };
      const late = { wallet: Keypair.generate(), mint: Keypair.generate() };

      await stake(early.mint, early.wallet.publicKey, 20);
      await createAtaAndMint(provider, fanoutMint, 100, fanout!);
      await stake(late.mint, late.wallet.publicKey, 80);

      await distribute(early.mint, early.wallet.publicKey);
      await distribute(late.mint, late.wallet.publicKey);

      // The 100 arrived while `early` held every staked share, so all of it is
      // owed to `early` however many shares stake afterwards.
      expect(await balanceOf(fanoutMint, early.wallet.publicKey)).to.eq(
        BigInt(100)
      );
      expect(await balanceOf(fanoutMint, late.wallet.publicKey)).to.eq(
        BigInt(0)
      );
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
          await stake(mint, wallet.publicKey, amount);
        }
      });

      it("pays a re-staked position from the inflow that follows it", async () => {
        const [first, second] = positions;

        await createAtaAndMint(provider, fanoutMint, 100, fanout!);
        await distribute(first.mint, first.wallet.publicKey);
        await distribute(second.mint, second.wallet.publicKey);

        await program.methods
          .unstakeV0()
          .accountsPartial({
            mint: first.mint.publicKey,
            solDestination: me,
            voucherAuthority: first.wallet.publicKey,
          })
          .signers([first.wallet])
          .rpc({ skipPreflight: true });

        const restaked = Keypair.generate();
        await stake(restaked, first.wallet.publicKey, first.amount, {
          staker: first.wallet,
        });

        await createAtaAndMint(provider, fanoutMint, 100, fanout!);
        await distribute(restaked, first.wallet.publicKey);
        await distribute(second.mint, second.wallet.publicKey);

        // Each round of 100 splits 20/80, and the re-staked voucher shares the
        // second round on the same terms as the first.
        expect(await balanceOf(fanoutMint, first.wallet.publicKey)).to.eq(
          BigInt(2 * first.amount)
        );
        expect(await balanceOf(fanoutMint, second.wallet.publicKey)).to.eq(
          BigInt(2 * second.amount)
        );
      });

      it("releases an uncollected entitlement to the vouchers that remain", async () => {
        const [first, second] = positions;

        await createAtaAndMint(provider, fanoutMint, 100, fanout!);
        await distribute(second.mint, second.wallet.publicKey);
        expect(await balanceOf(fanoutMint, second.wallet.publicKey)).to.eq(
          BigInt(second.amount)
        );

        // `first` leaves without collecting its 20.
        await program.methods
          .unstakeV0()
          .accountsPartial({
            mint: first.mint.publicKey,
            solDestination: me,
            voucherAuthority: first.wallet.publicKey,
          })
          .signers([first.wallet])
          .rpc({ skipPreflight: true });

        await distribute(second.mint, second.wallet.publicKey);
        expect(await balanceOf(fanoutMint, second.wallet.publicKey)).to.eq(
          BigInt(100)
        );

        const vault = getAssociatedTokenAddressSync(fanoutMint, fanout!, true);
        expect((await getAccount(provider.connection, vault)).amount).to.eq(
          BigInt(0)
        );
      });

      it("unstakes a position holding more than its shares", async () => {
        const [first, second] = positions;
        const voucher = membershipVoucherKey(first.mint.publicKey)[0];
        // More than the shares left staked after this voucher closes, so the
        // stake account balance and the voucher's shares cannot be confused.
        const surplus = 81;

        await createAtaAndMint(provider, membershipMint, surplus, voucher);

        await program.methods
          .unstakeV0()
          .accountsPartial({
            mint: first.mint.publicKey,
            solDestination: me,
            voucherAuthority: first.wallet.publicKey,
          })
          .signers([first.wallet])
          .rpc({ skipPreflight: true });

        expect(await balanceOf(membershipMint, first.wallet.publicKey)).to.eq(
          BigInt(first.amount + surplus)
        );

        const fanoutAcc = await program.account.fanoutV0.fetch(fanout!);
        expect(fanoutAcc.totalStakedShares.toNumber()).to.eq(second.amount);
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
        async function distributeAll() {
          for (const { wallet, mint } of positions) {
            await distribute(mint, wallet.publicKey);
          }
        }

        await createAtaAndTransfer(provider, fanoutMint, 4, me, fanout);

        await distributeAll();

        for (const { wallet, amount } of positions) {
          const toAccount = await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(fanoutMint, wallet.publicKey)
          );
          // This first dist will ignore dust. Position 1 gets 0, position 2 gets 4.
          expect(toAccount.amount).to.eq(
            BigInt(Math.floor((amount / 100) * 4))
          );
        }

        await createAtaAndTransfer(provider, fanoutMint, 1, me, fanout);

        await distributeAll();

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
