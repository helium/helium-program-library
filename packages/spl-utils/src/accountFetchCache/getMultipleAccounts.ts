import { AccountInfo, PublicKey } from "@solana/web3.js";

export const chunks = <T,>(array: T[], size: number): T[][] =>
  Array.apply(
    0,
    new Array(Math.ceil(array.length / size))
  ).map((_, index) => array.slice(index * size, (index + 1) * size));

const getMultipleAccountsCore = async (
  connection: any,
  keys: string[],
  commitment: string
) => {
  const args = connection._buildArgs([keys], commitment, "base64");

  const unsafeRes = await connection._rpcRequest("getMultipleAccounts", args);
  if (unsafeRes.error) {
    throw new Error(
      "failed to get info about account " + unsafeRes.error.message
    );
  }

  if (unsafeRes.result.value) {
    const array = unsafeRes.result.value as AccountInfo<string[]>[];
    return { keys, array };
  }

  // TODO: fix
  throw new Error();
};

export const getMultipleAccounts = async (
  connection: any,
  keys: string[],
  commitment: string
): Promise<{ keys: string[]; array: AccountInfo<Buffer>[] }> => {
  const result = await getMultipleAccountsCore(connection, keys, commitment);

  const array = result.array.map((acc) => {
    if (!acc) {
      return undefined;
    }

    const { data, ...rest } = acc;
    const obj = {
      ...rest,
      owner: rest.owner && new PublicKey(rest.owner),
      data: Buffer.from(data[0], "base64"),
    } as AccountInfo<Buffer>;
    return obj;
  }) as AccountInfo<Buffer>[];
  return { keys, array };
};
