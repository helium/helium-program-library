import * as anchor from "@project-serum/anchor";
import {
  IdlAccountItem, IdlAccounts
} from "@project-serum/anchor/dist/cjs/idl";
import { CustomAccountResolver } from "@project-serum/anchor/dist/cjs/program/accounts-resolver";
import { PublicKey } from "@solana/web3.js";
import camelCase from "camelcase";
import { Accounts, get, set } from "./utils";

type IndividualResolver = (args: {
  programId: PublicKey;
  provider: anchor.Provider;
  path: string[];
  accounts: Accounts;
}) => Promise<PublicKey | undefined>;

async function resolveIndividualImpl({
  idlAccounts,
  programId,
  provider,
  accounts,
  path = [],
  resolver,
}: {
  idlAccounts: IdlAccountItem;
  provider: anchor.Provider;
  programId: PublicKey;
  accounts: Accounts;
  path?: string[];
  resolver: IndividualResolver;
}): Promise<void> {
  const newPath = [...path, camelCase(idlAccounts.name)];

  if ((idlAccounts as IdlAccounts).accounts) {
    const subAccounts = (idlAccounts as IdlAccounts).accounts;
    for (let k = 0; k < subAccounts.length; k += 1) {
      const subAccount = subAccounts[k];
      await resolveIndividualImpl({
        idlAccounts: subAccount,
        programId,
        provider,
        accounts,
        path: newPath,
        resolver,
      });
    }
  } else {
    set(
      accounts,
      newPath,
      get(accounts, newPath) ||
        (await resolver({
          programId,
          provider,
          path: newPath,
          accounts,
        }))
    );
  }
}

/**
 * Allows custom account resolution by functionaly operating on one account at a time.
 * 
 * Check the `path` arg to see the account name being operated on, and use `accounts` and `provider` to fill in any
 * details necessary
 * 
 * @param resolver 
 * @returns 
 */
export function resolveIndividual<T extends anchor.Idl>(
  resolver: IndividualResolver
): CustomAccountResolver<T> {
  return async ({ idlIx, accounts, programId, provider }) => {
    for (let k = 0; k < idlIx.accounts.length; k += 1) {
      await resolveIndividualImpl({
        idlAccounts: idlIx.accounts[k],
        programId,
        provider,
        resolver,
        accounts,
      });
    }
    return accounts;
  };
}
