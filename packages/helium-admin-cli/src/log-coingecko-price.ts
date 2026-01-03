import yargs from "yargs/yargs";
import { findCoingeckoPrice } from "./submit-price";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    tokenName: {
      type: "string",
      alias: "t",
      default: "helium",
    }
  });

  const argv = await yarg.argv;
  console.log(await findCoingeckoPrice(argv.tokenName));
}
