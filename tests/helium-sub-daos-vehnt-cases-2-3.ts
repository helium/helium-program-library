import {
  SubDaoTestContext,
  describeVehntCases,
  useDaoAndSubDaoWorld,
  useSubDaoPrograms,
} from "./utils/helium-sub-daos";

describe("helium-sub-daos", () => {
  const ctx: SubDaoTestContext = useSubDaoPrograms();

  describe("with dao and subdao", () => {
    useDaoAndSubDaoWorld(ctx);

    describeVehntCases(ctx, "cases-2-3");
  });
});
