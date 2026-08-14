import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { PublicKey } from "@solana/web3.js";
import { pythPublishTime } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

export async function monitorPythFreshness(feed: PublicKey, label: string) {
  // The placeholder wallet is only required by the receiver constructor and
  // is never used to sign.
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection: provider.connection,
    wallet: { publicKey: PublicKey.default } as any,
  });
  watch(feed, (raw) => {
    if (!raw) return;
    const priceUpdate = pythSolanaReceiver.receiver.coder.accounts.decode(
      "priceUpdateV2",
      raw.data
    );
    pythPublishTime.set(
      { name: label, address: feed.toBase58() },
      priceUpdate.priceMessage.publishTime.toNumber()
    );
  });
}
