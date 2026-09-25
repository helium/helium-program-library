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
    let inFlight: Promise<void> = Promise.resolve();
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

    accountStream.on("data", ({ value }) => {
      accountStream.pause();
      inFlight = (async () => {
        try {
          await onAccount(value);
          accountStream.resume();
        } catch (err) {
          reject(err);
          // No error argument: after the pipeline finishes nothing listens for "error".
          accountStream.destroy();
        }
      })();
    });

    accountStream.on("end", () => {
      if (!hasReceivedData) {
        console.log("Stream ended without receiving any data");
      }
      // "end" can fire while the last onAccount is still awaiting.
      inFlight.then(() => resolve());
    });
  });
};
