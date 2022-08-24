import {
  AccountNamespace,
  Idl,
  InstructionNamespace,
  Program,
  AnchorProvider,
  RpcNamespace,
} from "@project-serum/anchor";
import { AllInstructions } from "@project-serum/anchor/dist/cjs/program/namespace/types";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import { PublicKey, Signer, TransactionInstruction, Commitment, Finality } from "@solana/web3.js";
import { TypedAccountParser } from "./accountFetchCache";
import { BigInstructionResult, InstructionResult, sendInstructions, sendMultipleInstructions } from "./transaction";

export abstract class AnchorSdk<IDL extends Idl> {
  program: Program<IDL>;
  provider: AnchorProvider;
  programId: PublicKey;
  rpc: RpcNamespace<IDL, AllInstructions<IDL>>;
  instruction: InstructionNamespace<IDL, IDL["instructions"][number]>;
  wallet: Wallet;
  account: AccountNamespace<IDL>;
  errors: Map<number, string> | undefined;

  static ID: PublicKey;

  constructor(args: { provider: AnchorProvider; program: Program<IDL> }) {
    this.program = args.program;
    this.provider = args.provider;
    this.programId = args.program.programId;
    this.rpc = args.program.rpc;
    this.instruction = args.program.instruction;
    this.wallet = args.provider.wallet;
    this.account = args.program.account;
    this.errors = args.program.idl.errors?.reduce((acc, err) => {
      acc.set(err.code, `${err.name}: ${err.msg}`);
      return acc;
    }, new Map<number, string>());
  }

  protected async getAccount<T>(
    key: PublicKey,
    decoder: TypedAccountParser<T>
  ): Promise<T | null> {
    const account = await this.provider.connection.getAccountInfo(key);

    if (account) {
      return decoder(key, account);
    }

    return null;
  }

  async sendInstructions(
    instructions: TransactionInstruction[],
    signers: Signer[],
    payer?: PublicKey,
    commitment?: Commitment
  ): Promise<string> {
    try {
      return await sendInstructions(
        this.errors || new Map(),
        this.provider,
        instructions,
        signers,
        payer,
        commitment
      );
    } catch (e: any) {
      // If all compute was consumed, this can often mean that the bonding price moved too much, causing
      // our root estimates to be off.
      if (
        e.logs &&
        e.logs.some((l: string) =>
          l.endsWith("consumed 200000 of 200000 compute units")
        )
      ) {
        throw new Error(
          "Consumed all of the compute units. It's possible the price has moved too much, please try again."
        );
      }
      throw e;
    }
  }

  async execute<Output>(
    command: InstructionResult<Output>,
    payer: PublicKey = this.wallet.publicKey,
    commitment?: Commitment
  ): Promise<Output & { txid?: string }> {
    const { instructions, signers, output } = command;
    if (instructions.length > 0) {
      const txid = await this.sendInstructions(
        instructions,
        signers,
        payer,
        commitment
      );
      return { txid, ...output };
    }

    return output;
  }

  async executeBig<Output>(
    command: BigInstructionResult<Output>,
    payer: PublicKey = this.wallet.publicKey,
    finality?: Finality
  ): Promise<Output & { txids?: string[] }> {
    const { instructions, signers, output } = command;
    if (instructions.length > 0) {
      const txids = await sendMultipleInstructions(
        this.errors || new Map(),
        this.provider,
        instructions,
        signers,
        payer || this.wallet.publicKey,
        finality
      );
      return {
        ...output,
        txids: Array.from(txids),
      }
    }

    return output;
  }
}
