import {
  fanoutConfigForMintKey,
  fanoutConfigKey,
  init,
  membershipMintVoucherKey,
  membershipVoucherKey,
} from "@helium/hydra-sdk";
import {
  AssetProof,
  chunks,
  getAssetProof,
  getAssetsByOwner,
  HNT_MINT,
} from "@helium/spl-utils";
import { ClockworkProvider } from "@clockwork-xyz/sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import {
  createTransferInstruction,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  createTransferInstruction as createTokenTransfer,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountMeta,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { provider } from "./solana";
import BN from "bn.js";

export async function getMigrateTransactions(
  from: PublicKey,
  to: PublicKey
): Promise<Transaction[]> {
  const assetApiUrl =
    process.env.ASSET_API_URL || provider.connection.rpcEndpoint;
  const assets = await getAssetsByOwner(assetApiUrl, from.toBase58());

  const uniqueAssets = new Set(assets.map((asset) => asset.id.toBase58()));
  const vsrProgram = await initVsr(provider);

  const transferAssetIxns: TransactionInstruction[] = [];
  for (const asset of assets) {
    if (asset.compression.compressed) {
      const proof = await getAssetProof(assetApiUrl, asset.id);
      if (proof) {
        const treeAuthority = await getBubblegumAuthorityPDA(
          new PublicKey(proof.treeId)
        );

        const leafDelegate = asset.ownership.owner;
        const merkleTree = new PublicKey(proof.treeId);
        const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
          provider.connection,
          merkleTree,
          "confirmed"
        );
        const canopyHeight = tree.getCanopyDepth();
        const proofPath = mapProof(proof);
        const anchorRemainingAccounts = proofPath.slice(
          0,
          proofPath.length - (canopyHeight || 0)
        );

        transferAssetIxns.push(
          createTransferInstruction(
            {
              treeAuthority,
              leafOwner: asset.ownership.owner,
              leafDelegate,
              newLeafOwner: to,
              merkleTree,
              logWrapper: SPL_NOOP_PROGRAM_ID,
              compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
              anchorRemainingAccounts,
            },
            {
              root: [...proof.root.toBuffer()],
              dataHash: [...asset.compression.dataHash!],
              creatorHash: [...asset.compression.creatorHash!],
              nonce: asset.compression.leafId!,
              index: asset.compression.leafId!,
            }
          )
        );
      }
    } else {
      const fromAta = getAssociatedTokenAddressSync(asset.id, from);
      const toAta = getAssociatedTokenAddressSync(asset.id, to);
      transferAssetIxns.push(
        createAssociatedTokenAccountIdempotentInstruction(
          provider.wallet.publicKey,
          toAta,
          to,
          asset.id
        ),
        createTransferCheckedInstruction(fromAta, asset.id, toAta, from, 1, 0)
      );
      transferAssetIxns.push(
        createCloseAccountInstruction(
          fromAta,
          provider.wallet.publicKey,
          from,
          []
        )
      );
    }
  }

  const tokensResponse =
    await provider.connection.getParsedTokenAccountsByOwner(from, {
      programId: TOKEN_PROGRAM_ID,
    });
  const positions = [];
  const tokens = [];
  for (const token of tokensResponse.value) {
    const mint = new PublicKey(token.account.data.parsed.info.mint);
    const freezeAuth = (await getMint(provider.connection, mint))
      .freezeAuthority;
    const freezeAuthOwner =
      freezeAuth &&
      (await provider.connection.getAccountInfo(freezeAuth)).owner;
    if (freezeAuthOwner && freezeAuthOwner.equals(vsrProgram.programId)) {
      positions.push(mint);
    } else {
      tokens.push(token);
    }
  }

  const transferPositionIxns = (
    await Promise.all(
      positions.map(async (position) => {
        return [
          await vsrProgram.methods
            .ledgerTransferPositionV0()
            .accounts({
              to,
              from,
              payer: provider.wallet.publicKey,
              mint: position,
            })
            .instruction(),
          createCloseAccountInstruction(
            getAssociatedTokenAddressSync(position, from),
            provider.wallet.publicKey,
            from,
            []
          ),
        ];
      })
    )
  ).flat();

  const transferTokenInstructions = tokens
    .filter((token) => !uniqueAssets.has(token.account.data.parsed.info.mint))
    // We handle HNT separately since HST may be distributing to it
    .filter(
      (token) =>
        !new PublicKey(token.account.data.parsed.info.mint).equals(HNT_MINT)
    )
    .flatMap((token) => {
      const mint = new PublicKey(token.account.data.parsed.info.mint);
      const amount = token.account.data.parsed.info.tokenAmount.uiAmount;
      const fromAta = token.pubkey;
      const toAta = getAssociatedTokenAddressSync(mint, to);
      if (amount > 0) {
        return [
          createAssociatedTokenAccountIdempotentInstruction(
            provider.wallet.publicKey,
            toAta,
            to,
            mint
          ),
          createTokenTransfer(
            fromAta,
            toAta,
            from,
            token.account.data.parsed.info.tokenAmount.amount
          ),
          createCloseAccountInstruction(
            fromAta,
            provider.wallet.publicKey,
            from,
            []
          ),
        ];
      } else {
        return createCloseAccountInstruction(fromAta, to, from, []);
      }
    });

  // Handle HST and HNT
  /* Migrate HST happens in several steps

  1. Create HST ATA if it doesn't exist for `from` account
  2. Delete the thread if there is one
  3. Create HNT ATA if it doesn't exist for `from` account
  4. Create HNT ATA if it doesn't exist for `to` account
  5. Calculate how much hnt will be distributed if we run the distribute command. Note that the distribute command _must_ be run before unstake.
  6. Run a distribute on the existing fanout wallet in case there's any hnt in there
  7. Unstake HST from the `from` account into `currAccountKey`
  8. Send both the existing HNT in the `from` hnt ata and the distributed amount to the `to` hnt ata
  7. Stake HST from `currAccountKey` into the `to` accounts stake account
  8. Create a thread for the `to` account
  9. Close the `from` hnt ata
  */
  const hntAccount = tokens
    .filter((token) => !uniqueAssets.has(token.account.data.parsed.info.mint))
    // We handle HNT separately since HST may be distributing to it
    .find((token) =>
      new PublicKey(token.account.data.parsed.info.mint).equals(HNT_MINT)
    );

  const fanoutConfig = fanoutConfigKey("HST")[0];
  const voucher = membershipVoucherKey(fanoutConfig, from)[0];
  const hydraProgram = await init(provider);
  const fanout = await hydraProgram.account.fanout.fetch(fanoutConfig);
  const hst = fanout.membershipMint;
  const stakeAccountKey = getAssociatedTokenAddressSync(hst, voucher, true);
  const currAccountKey = getAssociatedTokenAddressSync(hst, from, true);
  let stakeAccountBal = BigInt(0);
  if (await provider.connection.getAccountInfo(stakeAccountKey)) {
    stakeAccountBal = (await getAccount(provider.connection, stakeAccountKey))
      .amount;
  }

  const hstInstructions = [];
  if (stakeAccountBal > 0) {
    const [fanoutConfigForMint] = fanoutConfigForMintKey(
      fanoutConfig,
      HNT_MINT
    );
    const name = fanout.name;
    const threadId = `${name}-${from.toBase58().slice(0, 8)}`;
    const [thread] = threadKey(provider.wallet.publicKey, threadId);
    const hydraIxns = [];
    const clockworkIxns = [];

    // Create HST ATA if it doesn't exist for `from` account
    hydraIxns.push(
      await createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        currAccountKey,
        from,
        hst
      )
    );

    // Delete the thread if there is one
    const clockworkProvider = new ClockworkProvider(
      provider.wallet,
      provider.connection
    );
    if (await provider.connection.getAccountInfo(thread)) {
      clockworkIxns.push(
        await clockworkProvider.threadDelete(provider.wallet.publicKey, thread)
      );
    }

    const newVoucher = membershipVoucherKey(fanoutConfig, to)[0];
    const newMemberStakeAccount = await getAssociatedTokenAddressSync(
      hst,
      newVoucher,
      true
    );
    const currHntAccount = getAssociatedTokenAddressSync(HNT_MINT, from);
    const toHntAccount = getAssociatedTokenAddressSync(HNT_MINT, to);

    const fanoutForMintMembershipVoucher = membershipMintVoucherKey(
      fanoutConfigForMint,
      from,
      HNT_MINT
    )[0];

    // Calculate how much HNT will we get when we run distribute so we can transfer it to the `to` account
    // Add that to the amount of HNT we already posses to make sure we transfer everything to `to`
    const fanoutForMintMembershipVoucherAcc =
      await hydraProgram.account.fanoutMembershipMintVoucher.fetch(
        fanoutForMintMembershipVoucher
      );
    const holdingAccount = getAssociatedTokenAddressSync(
      HNT_MINT,
      fanoutConfig,
      true
    );
    const holdingAccountBal = new BN(
      (await getAccount(provider.connection, holdingAccount)).amount.toString()
    );
    const sharesDiff = fanout.totalShares.sub(fanout.totalStakedShares);
    const diff = holdingAccountBal.sub(fanout.lastSnapshotAmount);
    const totalInflow = fanout.totalInflow.add(diff).add(
      diff.mul(sharesDiff).div(fanout.totalStakedShares) // Apply correction factor
    );
    const distributeAmount = totalInflow
      .sub(fanoutForMintMembershipVoucherAcc.lastInflow)
      .mul(new BN(stakeAccountBal.toString()))
      .div(fanout.totalShares);

    const hntAlready = hntAccount
      ? new BN(
          hntAccount.account.data.parsed.info.tokenAmount.amount.toString()
        )
      : new BN(0);
    const hntTotal = hntAlready.add(distributeAmount);

    hydraIxns.push(
      // Give some lamports to cover rent of the stake account
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: from,
        lamports: LAMPORTS_PER_SOL / 10,
      }),
      // Ensure both from and to have HNT accounts
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        currHntAccount,
        from,
        HNT_MINT
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        toHntAccount,
        to,
        HNT_MINT
      ),
      // Distribute before unstaking
      await hydraProgram.methods
        .processDistributeToken(true)
        .accounts({
          payer: provider.wallet.publicKey,
          member: from,
          fanout: fanoutConfig,
          holdingAccount: getAssociatedTokenAddressSync(
            HNT_MINT,
            fanoutConfig,
            true
          ),
          fanoutForMint: fanoutConfigForMint,
          fanoutMint: HNT_MINT,
          fanoutMintMemberTokenAccount: currHntAccount,
          memberStakeAccount: stakeAccountKey,
          membershipMint: hst,
          fanoutForMintMembershipVoucher,
        })
        .instruction(),
      // Unstake HST into the current account
      await hydraProgram.methods
        .processUnstake()
        .accounts({
          member: from,
          fanout: fanoutConfig,
          membershipMint: hst,
          membershipMintTokenAccount: currAccountKey,
          memberStakeAccount: stakeAccountKey,
        })
        .instruction(),
      // Stake for the new wallet
      createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        newMemberStakeAccount,
        newVoucher,
        hst
      ),
      await hydraProgram.methods
        .processSetForTokenMemberStake(new BN(stakeAccountBal.toString()))
        .accounts({
          authority: from,
          member: to,
          fanout: fanoutConfig,
          membershipMint: hst,
          membershipMintTokenAccount: currAccountKey,
          memberStakeAccount: newMemberStakeAccount,
        })
        .instruction(),
      // Transfer all distributed HNT to the to HNT account
      createTokenTransfer(
        currHntAccount,
        toHntAccount,
        from,
        BigInt(hntTotal.toString())
      ),
      createCloseAccountInstruction(
        currHntAccount,
        provider.wallet.publicKey,
        from
      ),
      // Take lamports back that covered rent of the stake account
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: provider.wallet.publicKey,
        lamports: 99975000,
      })
    );

    // Create a thread for the `to` account
    const newThreadId = `${name}-${to.toBase58().slice(0, 8)}`;
    const [newThread] = threadKey(provider.wallet.publicKey, newThreadId);
    if (!(await provider.connection.getAccountInfo(newThread))) {
      clockworkIxns.push(
        await clockworkProvider.threadCreate(
          provider.wallet.publicKey,
          newThreadId,
          [
            await hydraProgram.methods
              .processDistributeToken(true)
              .accounts({
                payer: new PublicKey(
                  "C1ockworkPayer11111111111111111111111111111"
                ),
                member: to,
                fanout: fanoutConfig,
                holdingAccount: getAssociatedTokenAddressSync(
                  HNT_MINT,
                  fanoutConfig,
                  true
                ),
                fanoutForMint: fanoutConfigForMint,
                fanoutMint: HNT_MINT,
                fanoutMintMemberTokenAccount: getAssociatedTokenAddressSync(
                  HNT_MINT,
                  to
                ),
                memberStakeAccount: stakeAccountKey,
                membershipMint: hst,
                fanoutForMintMembershipVoucher: membershipMintVoucherKey(
                  fanoutConfigForMint,
                  to,
                  HNT_MINT
                )[0],
              })
              .instruction(),
          ],
          {
            cron: {
              schedule: "0 0 30 * * * *",
              skippable: true,
            },
          },
          LAMPORTS_PER_SOL / 10
        )
      );
    }

    hstInstructions.push(hydraIxns);
    if (clockworkIxns.length > 0) {
      hstInstructions.push(clockworkIxns);
    }
  } else if (hntAccount) {
    const amount = hntAccount.account.data.parsed.info.tokenAmount.uiAmount;
    const fromAta = hntAccount.pubkey;
    const toAta = getAssociatedTokenAddressSync(HNT_MINT, to);
    if (amount > 0) {
      transferTokenInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          provider.wallet.publicKey,
          toAta,
          to,
          HNT_MINT
        ),
        createTokenTransfer(
          fromAta,
          toAta,
          from,
          BigInt(hntAccount.account.data.parsed.info.tokenAmount.amount)
        ),
        createCloseAccountInstruction(
          fromAta,
          provider.wallet.publicKey,
          from,
          []
        )
      );
    } else {
      transferTokenInstructions.push(
        createCloseAccountInstruction(fromAta, to, from, [])
      );
    }
  }

  const lamports = await provider.connection.getBalance(from);

  const recentBlockhash = (await provider.connection.getLatestBlockhash())
    .blockhash;
  const transactions: Transaction[] = [];
  for (const chunk of chunks(transferPositionIxns, 4)) {
    const tx = new Transaction({
      feePayer: from,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  for (const chunk of chunks(transferPositionIxns, 2)) {
    const tx = new Transaction({
      feePayer: from,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  transferTokenInstructions.push(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports:
        lamports -
        (transactions.reduce((acc, tx) => acc + tx.signatures.length, 0) + 2) *
          5000,
    })
  );

  for (const chunk of hstInstructions) {
    const tx = new Transaction({
      feePayer: from,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  const tx = new Transaction({
    feePayer: from,
    recentBlockhash,
  });
  tx.add(...transferTokenInstructions);

  // Do not remove this line. Fun fact, tx.signatures will be empty unless you do this once.
  tx.serialize({ requireAllSignatures: false });
  if (
    tx.signatures.some((sig) => sig.publicKey.equals(provider.wallet.publicKey))
  ) {
    transactions.push(await provider.wallet.signTransaction(tx));
  } else {
    transactions.push(tx);
  }

  return transactions;
}

const mapProof = (assetProof: AssetProof): AccountMeta[] => {
  if (!assetProof.proof || assetProof.proof.length === 0) {
    throw new Error("Proof is empty");
  }
  return assetProof.proof.map((node) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
};

const getBubblegumAuthorityPDA = async (merkleRollPubKey: PublicKey) => {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return bubblegumAuthorityPDAKey;
};

const CLOCKWORK_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);
function threadKey(
  authority: PublicKey,
  threadId: string,
  programId: PublicKey = CLOCKWORK_PID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("thread", "utf8"),
      authority.toBuffer(),
      Buffer.from(threadId, "utf8"),
    ],
    programId
  );
}
