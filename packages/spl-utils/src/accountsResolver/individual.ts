import * as anchor from "@project-serum/anchor";
import {
  IdlAccountItem,
  IdlAccounts,
} from "@project-serum/anchor/dist/cjs/idl";
import { CustomAccountResolver } from "@project-serum/anchor/dist/cjs/program/accounts-resolver";
import { AllInstructions } from "@project-serum/anchor/dist/cjs/program/namespace/types";
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
}): Promise<void> {
  const newPath = [...path, camelCase(idlAccounts.name)];

  if ((idlAccounts as IdlAccounts).accounts) {
    const subAccounts = (idlAccounts as IdlAccounts).accounts;
    for (let k = 0; k < subAccounts.length; k += 1) {
      const subAccount = subAccounts[k];
      const subArgs = args[k];

      await resolveIndividualImpl({
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
  } else {
    set(
      accounts,
      newPath,
      get(accounts, newPath) ||
        (await resolver({
          programId,
          provider,
          path: newPath,
          args,
          accounts,
          idlIx,
        }))
    );
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
    for (let k = 0; k < idlIx.accounts.length; k += 1) {
      await resolveIndividualImpl({
        idlAccounts: idlIx.accounts[k],
        programId,
        provider,
        resolver,
        args,
        accounts,
        idlIx,
      });
    }
    return accounts;
  };
}
