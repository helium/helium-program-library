import { PublicKey } from "@solana/web3.js";

/**
 * Whether `wallet` can sign a transaction itself. An address off the ed25519
 * curve is a program address, typically a Squads vault: it holds the assets but
 * has no key, so a transaction built for it is delivered by re-wrapping it into
 * a multisig proposal that the members approve and execute.
 *
 * That re-wrap keeps the transaction's message and discards its signatures, so
 * an action whose transaction is signed by an ephemeral keypair as it is built
 * cannot be served to such a wallet.
 */
export function canSign(wallet: PublicKey): boolean {
  return PublicKey.isOnCurve(wallet.toBytes());
}
