import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter } from "@solana/web3.js";

interface GetAllAccountsAgs {
  provider: anchor.AnchorProvider;
  program: anchor.Program<anchor.Idl>;
  idlAccountType: string;
  pageSize?: number;
  offset?: number;
}

export const getAllAccounts = async ({
  provider,
  program,
  idlAccountType,
  pageSize = 10000,
  offset = 0,
}: GetAllAccountsAgs) => {
  let allAccounts = [];
  let hasNextPage = true;

  const filter: { offset?: number; bytes?: string; dataSize?: number } =
    program.coder.accounts.memcmp(idlAccountType, undefined);
  const coderFilters: GetProgramAccountsFilter[] = [];

  if (filter?.offset != undefined && filter?.bytes != undefined) {
    coderFilters.push({
      memcmp: { offset: filter.offset, bytes: filter.bytes },
    });
  }

  if (filter?.dataSize != undefined) {
    coderFilters.push({ dataSize: filter.dataSize });
  }

  while (hasNextPage) {
    // Get the next page of accounts
    const pageAccounts = await provider.connection.getProgramAccounts(
      program.programId,
      {
        commitment: provider.connection.commitment,
        filters: [...coderFilters],
        dataSlice: {
          offset,
          length: pageSize,
        },
      }
    );

    // Add the page accounts to the allAccounts array
    allAccounts.push(...pageAccounts);

    // Check if there are more pages
    if (pageAccounts.length < pageSize) {
      hasNextPage = false;
    } else {
      offset += pageSize;
    }
  }

  return allAccounts;
};
