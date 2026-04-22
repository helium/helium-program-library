import { publicProcedure } from "@/server/api/procedures";
import { getProxies } from "@/lib/queries/governance/proxies";

export const getProxiesProcedure =
  publicProcedure.governance.getProxies.handler(async ({ input }) => {
    return (await getProxies(input)) as never;
  });
