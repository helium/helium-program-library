import {
  AssetProof,
  batchInstructionsToTxsWithPriorityFee,
  chunks,
  getAssetProof,
  getAssetsByOwner,
  truthy,
  toVersionedTx,
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
  VersionedTransaction,
} from "@solana/web3.js";
import { provider } from "./solana";

export async function getMigrateTransactions(
  from: PublicKey,
  to: PublicKey
): Promise<VersionedTransaction[]> {
  const assetApiUrl =
    process.env.ASSET_API_URL || provider.connection.rpcEndpoint;
  // Filter out all subscriber NFTs
  const assets = (await getAssetsByOwner(assetApiUrl, from.toBase58())).filter(
    (asset) => asset?.content?.metadata?.symbol !== "SUBSCRIBER"
  );

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
        if (anchorRemainingAccounts.length > 10) {
          console.log(
            `Asset ${asset.id} skipped due to having insufficient canopy`
          );
          continue;
        }

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
      (await provider.connection.getAccountInfo(freezeAuth))?.owner;
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
            .accountsPartial({
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

  const transactions = await batchInstructionsToTxsWithPriorityFee(provider, [
    ...transferAssetIxns,
    ...transferPositionIxns,
    ...transferTokenInstructions,
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
  ]);

  return await Promise.all(
    transactions.map(toVersionedTx).map((tx, i) => {
      const draft = transactions[i];
      tx.serialize();
      if (
        draft.instructions.map((ix) => ix.keys).flat().some((key) =>
          key.pubkey.equals(provider.wallet.publicKey) && key.isSigner
        ) || draft.feePayer?.equals(provider.wallet.publicKey)
      ) {
        return provider.wallet.signTransaction(tx);
      }

      return tx;
    })
  );
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
