/// <reference types="node" />
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
export declare type Idl = {
    version: string;
    name: string;
    docs?: string[];
    instructions: IdlInstruction[];
    state?: IdlState;
    accounts?: IdlAccountDef[];
    types?: IdlTypeDef[];
    events?: IdlEvent[];
    errors?: IdlErrorCode[];
    constants?: IdlConstant[];
    metadata?: IdlMetadata;
};
export declare type IdlMetadata = any;
export declare type IdlConstant = {
    name: string;
    type: IdlType;
    value: string;
};
export declare type IdlEvent = {
    name: string;
    fields: IdlEventField[];
};
export declare type IdlEventField = {
    name: string;
    type: IdlType;
    index: boolean;
};
export declare type IdlInstruction = {
    name: string;
    docs?: string[];
    accounts: IdlAccountItem[];
    args: IdlField[];
    returns?: IdlType;
};
export declare type IdlState = {
    struct: IdlTypeDef;
    methods: IdlStateMethod[];
};
export declare type IdlStateMethod = IdlInstruction;
export declare type IdlAccountItem = IdlAccount | IdlAccounts;
export declare type IdlAccount = {
    name: string;
    isMut: boolean;
    isSigner: boolean;
    docs?: string[];
    relations?: string[];
    pda?: IdlPda;
};
export declare type IdlPda = {
    seeds: IdlSeed[];
    programId?: IdlSeed;
};
export declare type IdlSeed = any;
export declare type IdlAccounts = {
    name: string;
    docs?: string[];
    accounts: IdlAccountItem[];
};
export declare type IdlField = {
    name: string;
    docs?: string[];
    type: IdlType;
};
export declare type IdlTypeDef = {
    name: string;
    docs?: string[];
    type: IdlTypeDefTy;
};
export declare type IdlAccountDef = {
    name: string;
    docs?: string[];
    type: IdlTypeDefTyStruct;
};
export declare type IdlTypeDefTyStruct = {
    kind: "struct";
    fields: IdlTypeDefStruct;
};
export declare type IdlTypeDefTyEnum = {
    kind: "enum";
    variants: IdlEnumVariant[];
};
export declare type IdlTypeDefTy = IdlTypeDefTyEnum | IdlTypeDefTyStruct;
export declare type IdlTypeDefStruct = Array<IdlField>;
export declare type IdlType = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "bytes" | "string" | "publicKey" | IdlTypeDefined | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
export declare type IdlTypeDefined = {
    defined: string;
};
export declare type IdlTypeOption = {
    option: IdlType;
};
export declare type IdlTypeCOption = {
    coption: IdlType;
};
export declare type IdlTypeVec = {
    vec: IdlType;
};
export declare type IdlTypeArray = {
    array: [idlType: IdlType, size: number];
};
export declare type IdlEnumVariant = {
    name: string;
    fields?: IdlEnumFields;
};
export declare type IdlEnumFields = IdlEnumFieldsNamed | IdlEnumFieldsTuple;
export declare type IdlEnumFieldsNamed = IdlField[];
export declare type IdlEnumFieldsTuple = IdlType[];
export declare type IdlErrorCode = {
    code: number;
    name: string;
    msg?: string;
};
export declare function idlAddress(programId: PublicKey): Promise<PublicKey>;
export declare function seed(): string;
export interface IdlProgramAccount {
    authority: PublicKey;
    data: Buffer;
}
export declare function decodeIdlAccount(data: Buffer): IdlProgramAccount;
export declare function encodeIdlAccount(acc: IdlProgramAccount): Buffer;
//# sourceMappingURL=idl.d.ts.map