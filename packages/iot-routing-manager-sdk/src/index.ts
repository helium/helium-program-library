import { IotRoutingManager } from "@helium/idls/lib/types/iot_routing_manager";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { lazyDistributorResolvers } from "./resolvers";

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null,
): Promise<Program<IotRoutingManager>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }
  const iotRoutingManager = new Program<IotRoutingManager>(
    idl as IotRoutingManager,
    programId,
    provider,
    undefined,
    () => {
      return lazyDistributorResolvers;
    }
  ) as Program<IotRoutingManager>;
  return iotRoutingManager;
}
