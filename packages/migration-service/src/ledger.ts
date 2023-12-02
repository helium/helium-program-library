import {
  AssetProof,
  chunks,
  getAssetProof,
  getAssetsByOwner,
  truthy,
} from "@helium/spl-utils";
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
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountInfo,
  AccountMeta,
  ParsedAccountData,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { provider } from "./solana";

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

        const ixn = createTransferInstruction(
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
        );
        // Hack: Metaplex has a bug, this should be a signer.
        ixn.keys[1].isSigner = true;
        transferAssetIxns.push(ixn);
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
  const positions: PublicKey[] = [];
  const tokens: {
    pubkey: PublicKey;
    account: AccountInfo<ParsedAccountData>;
  }[] = [];
  for (const token of tokensResponse.value) {
    const mint = new PublicKey(token.account.data.parsed.info.mint);
    const freezeAuth = (await getMint(provider.connection, mint))
      .freezeAuthority;
    const freezeAuthOwner =
      freezeAuth &&
      (await provider.connection.getAccountInfo(freezeAuth))!.owner;
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
    .flatMap((token) => {
      const mint = new PublicKey(token.account.data.parsed.info.mint);
      const amount = token.account.data.parsed.info.tokenAmount.uiAmount;
      const frozen = token.account.data.parsed.info.state == "frozen";
      const fromAta = token.pubkey;
      const toAta = getAssociatedTokenAddressSync(mint, to);
      if (amount > 0 && !frozen) {
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
      } else if (!frozen) {
        return createCloseAccountInstruction(fromAta, to, from, []);
      }
    })
    .filter(truthy);

  const lamports = await provider.connection.getBalance(from);

  const recentBlockhash = (await provider.connection.getLatestBlockhash())
    .blockhash;
  const transactions: Transaction[] = [];
  for (const chunk of chunks(transferAssetIxns, 2)) {
    const tx = new Transaction({
      feePayer: provider.wallet.publicKey,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  for (const chunk of chunks(transferPositionIxns, 4)) {
    const tx = new Transaction({
      feePayer: provider.wallet.publicKey,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  for (const chunk of chunks(transferPositionIxns, 2)) {
    const tx = new Transaction({
      feePayer: provider.wallet.publicKey,
      recentBlockhash,
    });
    tx.add(...chunk);
    transactions.push(await provider.wallet.signTransaction(tx));
  }

  transferTokenInstructions.push(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    })
  );

  for (const chunk of chunks(transferTokenInstructions, 3)) {
    const tx = new Transaction({
      feePayer: provider.wallet.publicKey,
      recentBlockhash,
    });
    tx.add(...chunk);
    // Do not remove this line. Fun fact, tx.signatures will be empty unless you do this once.
    tx.serialize({ requireAllSignatures: false });
    if (
      tx.signatures.some((sig) =>
        sig.publicKey.equals(provider.wallet.publicKey)
      )
    ) {
      transactions.push(await provider.wallet.signTransaction(tx));
    } else {
      transactions.push(tx);
    }
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
