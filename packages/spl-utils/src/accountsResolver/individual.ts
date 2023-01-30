import * as anchor from "@coral-xyz/anchor";
import {
  IdlAccountItem,
  IdlAccounts,
} from "@coral-xyz/anchor/dist/cjs/idl";
import { CustomAccountResolver } from "@coral-xyz/anchor/dist/cjs/program/accounts-resolver";
import { AllInstructions } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { PublicKey } from "@solana/web3.js";
import camelCase from "camelcase";
import { Accounts, get, set } from "./utils";

type IndividualResolver = (args: {
  programId: PublicKey;
  provider: anchor.Provider;
  path: string[];
  args: Array<any>;
  accounts: Accounts;
  idlIx: AllInstructions<anchor.Idl>;
}) => Promise<PublicKey | undefined>;

async function resolveIndividualImpl({
  idlAccounts,
  programId,
  provider,
  args,
  accounts,
  path = [],
  resolver,
  idlIx,
}: {
  idlAccounts: IdlAccountItem;
  provider: anchor.Provider;
  programId: PublicKey;
  args: Array<any>;
  accounts: Accounts;
  path?: string[];
  resolver: IndividualResolver;
  idlIx: AllInstructions<anchor.Idl>;
}): Promise<number> {
  const newPath = [...path, camelCase(idlAccounts.name)];
  
  try {
    if ((idlAccounts as IdlAccounts).accounts) {
      let resolved = 0;
      const subAccounts = (idlAccounts as IdlAccounts).accounts;
      for (let k = 0; k < subAccounts.length; k += 1) {
        const subAccount = subAccounts[k];

        resolved += await resolveIndividualImpl({
          idlAccounts: subAccount,
          programId,
          provider,
          args,
          accounts,
          path: newPath,
          resolver,
          idlIx,
        });
      }

      return resolved;
    } else {
      let resolved = 0;
      let value = get(accounts, newPath);
      if (!value) {
        value = await resolver({
          programId,
          provider,
          path: newPath,
          args,
          accounts,
          idlIx,
        });
        if (value) {
          resolved = 1;
        }
      }
      set(accounts, newPath, value);
      return resolved;
    }
  } catch (e: any) {
    console.error(`Error while resolving ${newPath}`, e);
    throw e;
  }
}

/**
 * Allows custom account resolution by functionaly operating on one account at a time.
 *
 * Check the `path` arg to see the account name being operated on, and use `accounts` , `args` , and `provider` to fill in any
 * details necessary
 *
 * @param resolver
 * @returns
 */
export function resolveIndividual<T extends anchor.Idl>(
  resolver: IndividualResolver
): CustomAccountResolver<T> {
  return async ({ idlIx, args, accounts, programId, provider }) => {
    let resolved = 0;
    for (let k = 0; k < idlIx.accounts.length; k += 1) {
      resolved += await resolveIndividualImpl({
        idlAccounts: idlIx.accounts[k],
        programId,
        provider,
        resolver,
        args,
        accounts,
        idlIx,
      });
    }
    return {
      accounts,
      resolved
    }
  };
}
