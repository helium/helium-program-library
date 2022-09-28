import * as anchor from "@project-serum/anchor";

export function combineResolvers<T extends anchor.Idl>(...resolvers: anchor.CustomAccountResolver<T>[]): anchor.CustomAccountResolver<T> {
  return async (args) => {
    let accounts = args.accounts;
    for (let i = 0; i < resolvers.length; i += 1) {
      const resolver = resolvers[i];
      accounts = await resolver({ ...args, accounts });
    }

    return accounts;
  }
}
