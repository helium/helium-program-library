import { pipeline } from "stream";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";

export const streamAccounts = async (
  stream: NodeJS.ReadableStream,
  onAccount: (account: any) => Promise<void>
) => {
  return new Promise<void>((resolve, reject) => {
    let hasReceivedData = false;
    // .pipe() drops source errors, so a reset socket would never settle.
    const accountStream = pipeline(
      stream,
      parser(),
      pick({ filter: "result" }),
      streamArray(),
      (err) => {
        if (err) {
          console.error("Stream processing error:", err);
          reject(err);
        }
      }
    );

    stream.on("data", (chunk) => {
      if (!hasReceivedData) {
        hasReceivedData = true;
      }
    });

    accountStream.on("data", async ({ value }) => {
      accountStream.pause();
      try {
        await onAccount(value);
        accountStream.resume();
      } catch (err) {
        accountStream.destroy(err as Error);
        reject(err);
      }
    });

    accountStream.on("end", () => {
      if (!hasReceivedData) {
        console.log("Stream ended without receiving any data");
      }
      resolve();
    });
  });
};
