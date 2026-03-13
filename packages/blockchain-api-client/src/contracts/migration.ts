import { MigrateInputSchema, MigrateOutputSchema, MigratableHotspotsInputSchema, MigratableHotspotsOutputSchema } from "../schemas/migration";
import { UNAUTHORIZED, BAD_REQUEST, NOT_FOUND } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import { oc } from "@orpc/contract";

export const migrationContract = oc.tag("Migration").router({
  getHotspots: oc
    .route({
      method: "GET",
      path: "/migration/hotspots",
      summary: "Get hotspots that can be migrated (owned directly or in welcome packs)",
    })
    .input(MigratableHotspotsInputSchema)
    .output(MigratableHotspotsOutputSchema)
    .errors({
      BAD_REQUEST,
    }),
  migrate: oc
    .route({
      method: "POST",
      path: "/migration/migrate",
      summary: "Migrate assets to a new wallet",
      description:
        "Returns up to 5 transactions per call. If hasMore is true, submit the transactions then call again with nextParams.",
    })
    .input(MigrateInputSchema)
    .output(MigrateOutputSchema)
    .errors({
      UNAUTHORIZED,
      BAD_REQUEST,
      NOT_FOUND,
      INSUFFICIENT_FUNDS,
    }),
});
