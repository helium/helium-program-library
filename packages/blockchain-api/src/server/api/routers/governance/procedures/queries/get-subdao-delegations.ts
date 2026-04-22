import { publicProcedure } from "@/server/api/procedures";
import { getSubdaoDelegations } from "@/lib/queries/governance/subdao-delegations";

export const getSubdaoDelegationsProcedure =
  publicProcedure.governance.getSubdaoDelegations.handler(async () => {
    return await getSubdaoDelegations();
  });
