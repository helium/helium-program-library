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

    describeVehntCases(ctx, [
      "Case 4 (Cliff 100 4 years)",
      "Case 5 (Constant 100 4 years)",
    ]);
  });
});
