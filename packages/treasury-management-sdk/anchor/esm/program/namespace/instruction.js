import { TransactionInstruction, } from "@solana/web3.js";
import { IdlError } from "../../error.js";
import { toInstruction, validateAccounts, translateAddress, } from "../common.js";
import { splitArgsAndCtx } from "../context.js";
import * as features from "../../utils/features.js";
export default class InstructionNamespaceFactory {
    static build(idlIx, encodeFn, programId) {
        if (idlIx.name === "_inner") {
            throw new IdlError("the _inner name is reserved");
        }
        const ix = (...args) => {
            const [ixArgs, ctx] = splitArgsAndCtx(idlIx, [...args]);
            validateAccounts(idlIx.accounts, ctx.accounts);
            validateInstruction(idlIx, ...args);
            const keys = ix.accounts(ctx.accounts);
            if (ctx.remainingAccounts !== undefined) {
                keys.push(...ctx.remainingAccounts);
            }
            if (features.isSet("debug-logs")) {
                console.log("Outgoing account metas:", keys);
            }
            return new TransactionInstruction({
                keys,
                programId,
                data: encodeFn(idlIx.name, toInstruction(idlIx, ...ixArgs)),
            });
        };
        // Utility fn for ordering the accounts for this instruction.
        ix["accounts"] = (accs) => {
            return InstructionNamespaceFactory.accountsArray(accs, idlIx.accounts, idlIx.name);
        };
        return ix;
    }
    static accountsArray(ctx, accounts, ixName) {
        if (!ctx) {
            return [];
        }
        return accounts
            .map((acc) => {
            // Nested accounts.
            const nestedAccounts = "accounts" in acc ? acc.accounts : undefined;
            if (nestedAccounts !== undefined) {
                const rpcAccs = ctx[acc.name];
                return InstructionNamespaceFactory.accountsArray(rpcAccs, acc.accounts, ixName).flat();
            }
            else {
                const account = acc;
                let pubkey;
                try {
                    pubkey = translateAddress(ctx[acc.name]);
                }
                catch (err) {
                    throw new Error(`Wrong input type for account "${acc.name}" in the instruction accounts object${ixName !== undefined ? ' for instruction "' + ixName + '"' : ""}. Expected PublicKey or string.`);
                }
                return {
                    pubkey,
                    isWritable: account.isMut,
                    isSigner: account.isSigner,
                };
            }
        })
            .flat();
    }
}
// Throws error if any argument required for the `ix` is not given.
function validateInstruction(ix, ...args) {
    // todo
}
//# sourceMappingURL=instruction.js.map