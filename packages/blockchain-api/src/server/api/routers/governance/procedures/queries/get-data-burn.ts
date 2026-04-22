import { publicProcedure } from "@/server/api/procedures";
import { getDataBurn } from "@/lib/queries/governance/data-burn";

export const getDataBurnProcedure =
  publicProcedure.governance.getDataBurn.handler(async () => {
    return await getDataBurn();
  });
