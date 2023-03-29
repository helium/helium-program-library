import {
  AccountInfo, PublicKey
} from "@solana/web3.js";
import { cache } from "../solana";

export async function watch(
  account: PublicKey,
  onChange: (account: AccountInfo<Buffer> | undefined) => void
) {
  const [acc] = await cache.searchAndWatch(account);
  onChange(acc?.account);
  cache.emitter.onCache(async (e) => {
    const event = e;
    if (event.id === account.toString()) {
      // @ts-ignore
      onChange((await cache.search(account)).account!);
    }
  });

  // Force a requery every 30 seconds to ensure accuracy
  setInterval(async () => {
    // @ts-ignore
    onChange((await cache.search(account, undefined, false, true))?.account);
  }, 30 * 1000);
}
