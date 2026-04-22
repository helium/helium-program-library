import { publicProcedure } from "@/server/api/procedures";
import { getVotesByWallet } from "@/lib/queries/governance/votes";

export const getVotesByWalletProcedure =
  publicProcedure.governance.getVotesByWallet.handler(
    async ({ input, errors }) => {
      const rows = await getVotesByWallet(input);
      if (rows === null) {
        throw errors.NOT_FOUND({ message: "Registrar mint not found" });
      }
      return rows as never;
    },
  );
