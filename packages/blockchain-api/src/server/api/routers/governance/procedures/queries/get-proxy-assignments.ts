import { publicProcedure } from "@/server/api/procedures";
import { getProxyAssignments } from "@/lib/queries/governance/proxy-assignments";

export const getProxyAssignmentsProcedure =
  publicProcedure.governance.getProxyAssignments.handler(async ({ input }) => {
    const rows = await getProxyAssignments(input);
    return rows.map((row) => row.get({ plain: true }));
  });
