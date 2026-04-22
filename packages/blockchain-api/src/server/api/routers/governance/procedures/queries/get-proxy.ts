import { publicProcedure } from "@/server/api/procedures";
import { getProxy } from "@/lib/queries/governance/proxies";

export const getProxyProcedure = publicProcedure.governance.getProxy.handler(
  async ({ input }) => {
    const { registrar, wallet } = input;
    return (await getProxy(registrar, wallet)) as never;
  },
);
