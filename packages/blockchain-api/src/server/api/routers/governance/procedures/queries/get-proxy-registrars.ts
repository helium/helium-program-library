import { publicProcedure } from "@/server/api/procedures";
import { getProxyRegistrars } from "@/lib/queries/governance/proxy-registrars";

export const getProxyRegistrarsProcedure =
  publicProcedure.governance.getProxyRegistrars.handler(async ({ input }) => {
    return await getProxyRegistrars(input.wallet);
  });
