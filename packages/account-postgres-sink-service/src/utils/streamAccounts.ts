import { pipeline as pipe } from "stream";
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
    const pipeline = pipe(
      stream,
      parser(),
      pick({ filter: "result" }),
      streamArray(),
      (err) => {
        if (err) {
          reject(err);
        }
      }
    );

    stream.on("data", (chunk) => {
      if (!hasReceivedData) {
        hasReceivedData = true;
      }
    });

    pipeline.on("data", async ({ value }) => {
      pipeline.pause();
      try {
        await onAccount(value);
        pipeline.resume();
      } catch (err) {
        reject(err);
      }
    });

    pipeline.on("end", () => {
      if (!hasReceivedData) {
        console.log("Stream ended without receiving any data");
      }
      resolve();
    });

    pipeline.on("error", (err: any) => {
      console.error("Stream processing error:", err);
      reject(err);
    });
  });
};
