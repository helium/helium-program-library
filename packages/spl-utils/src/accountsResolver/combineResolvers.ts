import * as anchor from "@coral-xyz/anchor";

export function combineResolvers<T extends anchor.Idl>(
  ...resolvers: anchor.CustomAccountResolver<T>[]
): anchor.CustomAccountResolver<T> {
  return async (args) => {
    let resolved = 0;
    let accounts = args.accounts;
    for (let i = 0; i < resolvers.length; i += 1) {
      const resolver = resolvers[i];
      const result = await resolver({ ...args, accounts });
      accounts = result.accounts;
      resolved += result.resolved;
    }

    return { accounts, resolved };
  };
}
