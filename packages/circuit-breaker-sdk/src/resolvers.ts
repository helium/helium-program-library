import { combineResolvers, resolveIndividual } from "@helium-foundation/spl-utils";
import { PROGRAM_ID } from "./constants";

export const circuitBreakerProgramResolver = resolveIndividual(
  async ({ path }) => {
    if (
      path[path.length - 1] === "circuitBreakerProgram"
    ) {
      return PROGRAM_ID;
    }
  }
);

export const circuitBreakerResolvers = combineResolvers(
  circuitBreakerProgramResolver
);
