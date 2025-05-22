import { IotRoutingManager } from "@helium/idls/lib/types/iot_routing_manager";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { iotRoutingManagerResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<IotRoutingManager>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const iotRoutingManager = new Program<IotRoutingManager>(
    idl as IotRoutingManager,
    provider,
    undefined,
    () => iotRoutingManagerResolvers
  ) as Program<IotRoutingManager>;

  return iotRoutingManager;
}
