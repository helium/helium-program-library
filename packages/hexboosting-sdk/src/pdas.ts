import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import BN from "bn.js";

enum DeviceType {
  cbrsIndoor,
  cbrsOutdoor,
  wifiIndoor,
  wifiOutdoor,
}

export function boostedHexKey(
  boostConfig: PublicKey,
  deviceType: any,
  location: BN,
  programId: PublicKey = PROGRAM_ID
) {
  const locBuffer = Buffer.alloc(8);
  locBuffer.writeBigUint64LE(BigInt(location.toString()));
  const deviceTypeName = Object.keys(deviceType)[0];
  let deviceTypeValue = DeviceType[deviceTypeName];
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("boosted_hex", "utf-8"),
      boostConfig.toBuffer(),
      Buffer.from([deviceTypeValue]),
      locBuffer,
    ],
    programId
  );
}

export function boostConfigKey(
  paymentMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("boost_config", "utf-8"), paymentMint.toBuffer()],
    programId
  );
}
