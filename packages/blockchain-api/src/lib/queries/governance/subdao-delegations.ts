import { IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { sequelize } from "@/lib/db";

const CACHE_TIME_MS = 1000 * 60 * 60 * 24;

interface SubdaoDelegations {
  mobile?: string;
  iot?: string;
}

let cached: SubdaoDelegations | null = null;
let cachedAt: number | null = null;

const MOBILE_SUBDAO = subDaoKey(MOBILE_MINT)[0].toBase58();
const IOT_SUBDAO = subDaoKey(IOT_MINT)[0].toBase58();

export async function getSubdaoDelegations(): Promise<SubdaoDelegations> {
  if (cached && cachedAt && cachedAt > Date.now() - CACHE_TIME_MS) {
    return cached;
  }

  const [rows] = await sequelize.query(`
SELECT
  sum(ve_tokens) as "totalVeTokens",
  sub_dao as "subDao"
FROM positions_with_vetokens p
JOIN delegated_positions d on d.position = p.address
WHERE d.expiration_ts >= (floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)) + 60 * 60 * 24 AND (
        lockup_kind = 'constant'
        or end_ts >= (
          floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)
        ) + 60 * 60 * 24
      )
GROUP BY sub_dao
  `);

  const result: SubdaoDelegations = {};
  for (const row of rows as Array<{ totalVeTokens: string; subDao: string }>) {
    if (row.subDao === MOBILE_SUBDAO) {
      result.mobile = row.totalVeTokens.split(".")[0];
    } else if (row.subDao === IOT_SUBDAO) {
      result.iot = row.totalVeTokens.split(".")[0];
    }
  }

  cached = result;
  cachedAt = Date.now();
  return cached;
}
