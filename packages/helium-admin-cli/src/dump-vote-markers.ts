import * as anchor from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { organizationKey } from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import b58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

type VoteMarkerV0 = anchor.IdlAccounts<VoterStakeRegistry>["voteMarkerV0"] & {
  address: PublicKey;
};

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    outputPath: {
      type: "string",
      describe: "The path to the output file",
      default: "vote-markers.json",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hvsrProgram = await initVsr(provider);
  const proposalProgram = await initProposal(provider);
  let myOrgs = new Set(
    [
      organizationKey("Helium")[0],
      organizationKey("Helium MOBILE")[0],
      organizationKey("Helium IOT")[0],
    ].map((k) => k.toBase58())
  );
  const proposals = (await proposalProgram.account.proposalV0.all()).filter(
    (p) => myOrgs.has(p.account.namespace.toBase58())
  );

  // Track votes in a map: proposalKey -> voter marker id --> VoteMarkerV0
  const votesByProposal = new Map<string, Map<string, VoteMarkerV0>>();
  for (const proposal of proposals) {
    votesByProposal.set(proposal.publicKey.toBase58(), new Map());
  }

  // Add position cache
  const positionCache = new Map<string, { mint: PublicKey }>();

  for (const proposal of proposals) {
    console.log(`Getting vote markers for ${proposal.publicKey.toBase58()}`);

    let signatures: anchor.web3.ConfirmedSignatureInfo[] = [];
    let lastSig: string | undefined = undefined;

    // // Keep fetching until we get all signatures
    while (true) {
      const sigs = await provider.connection.getSignaturesForAddress(
        proposal.publicKey,
        { before: lastSig, limit: 1000 },
        "confirmed"
      );

      if (sigs.length === 0) break;

      signatures.push(...sigs);
      lastSig = sigs[sigs.length - 1].signature;

      // If we got less than 1000, we've hit the end
      if (sigs.length < 1000) break;
    }

    console.log("signatures", signatures.length);

    const hvsrCoder = new anchor.BorshInstructionCoder(hvsrProgram.idl);
    const proposalCoder = new anchor.BorshInstructionCoder(proposalProgram.idl);

    // Process signatures in chunks of 100
    const chunkSize = 100;
    signatures = signatures.reverse();
    for (let i = 0; i < signatures.length; i += chunkSize) {
      const chunk = signatures.slice(i, i + chunkSize);
      const txs = await provider.connection.getTransactions(
        chunk.map((sig) => sig.signature),
        { maxSupportedTransactionVersion: 0, commitment: "confirmed" }
      );

      for (const tx of txs) {
        if (!tx?.meta || tx.meta.err) continue;

        let message = tx.transaction.message;
        let index = -1;
        for (const ix of message.compiledInstructions) {
          index++;
          try {
            // Check if instruction is from VSR program
            if (
              message.staticAccountKeys[ix.programIdIndex].toBase58() !==
              hvsrProgram.programId.toBase58()
            )
              continue;

            let decoded = hvsrCoder.decode(Buffer.from(ix.data));

            if (!decoded) continue;

            let formatted = hvsrCoder.format(
              decoded,
              ix.accountKeyIndexes.map((i) => {
                return {
                  pubkey: message.staticAccountKeys[i] || PublicKey.default,
                  isSigner: false,
                  isWritable: false,
                };
              })
            );

            if (!formatted) continue;

            // Handle vote instruction
            if (decoded.name === "voteV0") {
              const voter = formatted.accounts.find(
                (acc) => acc.name === "Voter"
              )?.pubkey;
              const registrar = formatted.accounts.find(
                (acc) => acc.name === "Registrar"
              )?.pubkey;
              const mint = formatted.accounts.find(
                (acc) => acc.name === "Mint"
              )?.pubkey;
              const proposal = formatted.accounts.find(
                (acc) => acc.name === "Proposal"
              )?.pubkey;
              const marker = formatted.accounts.find(
                (acc) => acc.name === "Marker"
              )?.pubkey;
              const innerIxs = tx.meta.innerInstructions?.find(
                (ix) => ix.index === index
              );
              const innerVoteIx = innerIxs?.instructions.find(
                (ix) =>
                  message.staticAccountKeys[ix.programIdIndex]?.toBase58() ===
                  proposalProgram.programId.toBase58()
              );
              const innerVoteDecoded = proposalCoder.decode(
                Buffer.from(b58.decode(innerVoteIx?.data || ""))
              );
              if (!innerVoteDecoded) {
                console.log(
                  "innerVoteDecoded missing",
                  index,
                  tx.meta.innerInstructions,
                  innerVoteIx,
                  innerIxs,
                  chunk
                );
              }
              // @ts-ignore
              let { weight, choice } = innerVoteDecoded!.data.args;
              let propMap = votesByProposal.get(proposal!.toBase58());

              let voteMarker = propMap!.get(marker!.toBase58());
              if (!voteMarker) {
                voteMarker = {
                  address: marker,
                  voter,
                  registrar,
                  proposal,
                  mint,
                  // @ts-ignore
                  choices: [choice],
                  weight: weight,
                  bumpSeed: 0,
                  deprecatedRelinquished: false,
                  proxyIndex: 0,
                  rentRefund: PublicKey.default,
                } as VoteMarkerV0;
              }
              if (!voteMarker.choices.some((c) => c === choice)) {
                voteMarker.choices.push(choice);
              }
              if (!voteMarker.weight.eq(weight)) {
                voteMarker.weight = weight;
              }
              propMap!.set(marker!.toBase58(), voteMarker);
            } else if (decoded.name === "proxiedVoteV0") {
              const voter = formatted.accounts.find(
                (acc) => acc.name === "Voter"
              )?.pubkey;
              const position = formatted.accounts.find(
                (acc) => acc.name === "Position"
              )?.pubkey;
              const registrar = formatted.accounts.find(
                (acc) => acc.name === "Registrar"
              )?.pubkey;
              const proposal = formatted.accounts.find(
                (acc) => acc.name === "Proposal"
              )?.pubkey;
              const marker = formatted.accounts.find(
                (acc) => acc.name === "Marker"
              )?.pubkey;

              // Use cache for position lookup
              let mint: PublicKey;
              if (position) {
                const positionKey = position.toBase58();
                if (!positionCache.has(positionKey)) {
                  const posData =
                    await hvsrProgram.account.positionV0.fetchNullable(
                      position
                    );
                  positionCache.set(positionKey, {
                    mint: posData?.mint || PublicKey.default,
                  });
                }
                mint = positionCache.get(positionKey)!.mint;
              } else {
                mint = PublicKey.default;
              }

              const innerIxs = tx.meta.innerInstructions?.find(
                (ix) => ix.index === index
              );
              const innerVoteIx = innerIxs?.instructions.find(
                (ix) =>
                  message.staticAccountKeys[ix.programIdIndex]?.toBase58() ===
                  proposalProgram.programId.toBase58()
              );
              const innerVoteDecoded = proposalCoder.decode(
                Buffer.from(b58.decode(innerVoteIx?.data || ""))
              );
              if (!innerVoteDecoded) {
                console.log(
                  "innerVoteDecoded missing",
                  index,
                  tx.meta.innerInstructions,
                  innerVoteIx,
                  innerIxs,
                  chunk
                );
              }
              // @ts-ignore
              let { weight, choice } = innerVoteDecoded!.data.args;
              let propMap = votesByProposal.get(proposal!.toBase58());
              let voteMarker = propMap!.get(marker!.toBase58());
              if (!voteMarker) {
                voteMarker = {
                  address: marker,
                  voter,
                  registrar,
                  proposal,
                  mint,
                  // @ts-ignore
                  choices: [choice],
                  weight,
                  bumpSeed: 0,
                  deprecatedRelinquished: false,
                  proxyIndex: 0,
                  rentRefund: PublicKey.default,
                } as VoteMarkerV0;
              }
              if (!voteMarker.choices.some((c) => c === choice)) {
                voteMarker.choices.push(choice);
              }
              if (!voteMarker.weight.eq(weight)) {
                voteMarker.weight = weight;
              }
              propMap!.set(marker!.toBase58(), voteMarker);
            } else if (decoded.name === "countProxyVoteV0") {
              const voter = formatted.accounts.find(
                (acc) => acc.name === "Voter"
              )?.pubkey;
              const position = formatted.accounts.find(
                (acc) => acc.name === "Position"
              )?.pubkey;
              const registrar = formatted.accounts.find(
                (acc) => acc.name === "Registrar"
              )?.pubkey;
              const proposal = formatted.accounts.find(
                (acc) => acc.name === "Proposal"
              )?.pubkey;
              const marker = formatted.accounts.find(
                (acc) => acc.name === "Marker"
              )?.pubkey;

              // Use cache for position lookup
              let mint: PublicKey;
              if (position) {
                const positionKey = position.toBase58();
                if (!positionCache.has(positionKey)) {
                  const posData =
                    await hvsrProgram.account.positionV0.fetchNullable(
                      position
                    );
                  positionCache.set(positionKey, {
                    mint: posData?.mint || PublicKey.default,
                  });
                }
                mint = positionCache.get(positionKey)!.mint;
              } else {
                mint = PublicKey.default;
              }

              const innerIxs = tx.meta.innerInstructions?.find(
                (ix) => ix.index === index
              );
              const innerVoteIxs = innerIxs?.instructions.filter(
                (ix) =>
                  message.staticAccountKeys[ix.programIdIndex]?.toBase58() ===
                  proposalProgram.programId.toBase58()
              );
              if (!innerVoteIxs) continue;
              for (const innerVoteIx of innerVoteIxs) {
                const innerVoteDecoded = proposalCoder.decode(
                  Buffer.from(b58.decode(innerVoteIx?.data || ""))
                );
                if (!innerVoteDecoded) {
                  console.log(
                    "innerVoteDecoded missing",
                    index,
                    tx.meta.innerInstructions,
                    innerVoteIx,
                    innerIxs,
                    chunk
                  );
                }
                // @ts-ignore
                let { weight, choice } = innerVoteDecoded!.data.args;
                let propMap = votesByProposal.get(proposal!.toBase58());
                let voteMarker = propMap!.get(marker!.toBase58());

                if (!voteMarker) {
                  voteMarker = {
                    address: marker,
                    voter,
                    registrar,
                    proposal,
                    mint,
                    // @ts-ignore
                    choices: [choice],
                    weight,
                    bumpSeed: 0,
                    deprecatedRelinquished: false,
                    proxyIndex: 0,
                    rentRefund: PublicKey.default,
                  } as VoteMarkerV0;
                }
                if (!voteMarker.choices.some((c) => c === choice)) {
                  voteMarker.choices.push(choice);
                }
                if (!voteMarker.weight.eq(weight)) {
                  voteMarker.weight = weight;
                }
                propMap!.set(marker!.toBase58(), voteMarker);
              }
            } else if (
              decoded.name === "relinquishVoteV1" ||
              decoded.name === "proxiedRelinquishVoteV0"
            ) {
              const firstIsSigner = message.isAccountSigner(
                ix.accountKeyIndexes[0]
              );
              // HACK: At some point we removed rent refund as first account and made it the last account.
              if (firstIsSigner && decoded.name === "relinquishVoteV1") {
                const len = ix.accountKeyIndexes.length;
                let refund = ix.accountKeyIndexes.shift();
                if (len != 12) {
                  // super legacy
                  ix.accountKeyIndexes.push(refund!);
                }
                decoded = hvsrCoder.decode(Buffer.from(ix.data))!;
                formatted = hvsrCoder.format(
                  decoded!,
                  ix.accountKeyIndexes.map((i) => {
                    return {
                      pubkey: message.staticAccountKeys[i] || PublicKey.default,
                      isSigner: false,
                      isWritable: false,
                    };
                  })
                )!;
              }

              const marker = formatted.accounts.find(
                (acc) => acc.name === "Marker"
              )?.pubkey;
              const proposal = formatted.accounts.find(
                (acc) => acc.name === "Proposal"
              )?.pubkey;
              const propMap = votesByProposal.get(proposal!.toBase58());
              let voteMarker = propMap!.get(marker!.toBase58());
              if (voteMarker) {
                voteMarker.choices = voteMarker.choices.filter(
                  // @ts-ignore
                  (c) => c !== decoded?.data?.args?.choice
                );
                if (voteMarker.choices.length === 0) {
                  propMap!.delete(marker!.toBase58());
                } else {
                  propMap!.set(marker!.toBase58(), voteMarker);
                }
              }
            }
          } catch (e) {
            console.log("error", index, tx.transaction.signatures[0]);
            throw e;
            // Skip instructions that can't be decoded
            continue;
          }
        }
      }
    }
  }

  let flattened = Array.from(votesByProposal.values()).flatMap((markers) => {
    return Array.from(markers.values()).map((marker) => ({
      address: marker.address.toBase58(),
      voter: marker.voter.toBase58(),
      registrar: marker.registrar.toBase58(),
      proposal: marker.proposal.toBase58(),
      mint: marker.mint.toBase58(),
      choices: marker.choices,
      weight: marker.weight.toString(),
      bumpSeed: marker.bumpSeed,
      deprecatedRelinquished: marker.deprecatedRelinquished,
      proxyIndex: marker.proxyIndex,
      rentRefund: marker.rentRefund.toBase58(),
    }));
  });
  // Write results to file
  const fs = require("fs");
  fs.writeFileSync(argv.outputPath, JSON.stringify(flattened, null, 2));
}
