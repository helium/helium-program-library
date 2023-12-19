import {
  PublicKey
} from "@solana/web3.js";
import os from "os";
import dotenv from "dotenv";

dotenv.config();

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const HNT_MINT = process.env.HNT_MINT
  ? new PublicKey(process.env.HNT_MINT)
  : new PublicKey("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");
export const MOBILE_MINT = process.env.MOBILE_MINT
  ? new PublicKey(process.env.MOBILE_MINT)
  : new PublicKey("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6");
export const IOT_MINT = process.env.IOT_MINT
  ? new PublicKey(process.env.IOT_MINT)
  : new PublicKey("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns");
