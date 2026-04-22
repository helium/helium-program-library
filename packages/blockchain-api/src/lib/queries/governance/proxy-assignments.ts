import { Connection, PublicKey } from "@solana/web3.js";
import { getPositionKeysForOwner } from "@helium/voter-stake-registry-sdk";
import { Op, type Attributes, type WhereOptions } from "sequelize";
import { Position } from "@/lib/models/governance/position";
import { ProxyAssignment } from "@/lib/models/governance/proxy-assignment";
import { env } from "@/lib/env";

interface GetProxyAssignmentsArgs {
  registrar: string;
  page: number;
  limit: number;
  voter?: string;
  nextVoter?: string;
  minIndex?: number;
  position?: string;
}

export async function getProxyAssignments(args: GetProxyAssignmentsArgs) {
  const { registrar, page, limit, voter, nextVoter, minIndex, position } = args;
  const where: WhereOptions<Attributes<ProxyAssignment>> = {};

  if (voter) {
    const { assets } = await getPositionKeysForOwner({
      connection: new Connection(env.SOLANA_RPC_URL),
      owner: new PublicKey(voter),
      registrar: new PublicKey(registrar),
    });

    (where as Record<symbol, unknown>)[Op.or] = [
      { voter },
      {
        [Op.and]: [
          {
            asset: { [Op.in]: assets.map((a) => a.toBase58()) },
            voter: PublicKey.default.toBase58(),
          },
        ],
      },
    ];
  }

  if (nextVoter) {
    (where as Record<string, unknown>).nextVoter = nextVoter;
  }

  (where as Record<string, unknown>).expirationTime = {
    [Op.gt]: new Date().valueOf() / 1000,
  };

  if (typeof minIndex !== "undefined") {
    (where as Record<string, unknown>).index = { [Op.gte]: minIndex };
  }

  const offset = (page - 1) * limit;

  return ProxyAssignment.findAll({
    where,
    offset,
    limit,
    include: position
      ? [
          {
            model: Position,
            where: { address: position },
            attributes: [],
            required: true,
          },
        ]
      : [
          {
            model: Position,
            where: { registrar },
            attributes: [],
            required: true,
          },
        ],
    order: [["index", "DESC"]],
  });
}
