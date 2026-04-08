import { v4 as uuidv4 } from "uuid";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import BN from "bn.js";
import { HNT_MINT } from "@helium/spl-utils";
import { Op } from "sequelize";

import { publicProcedure, withAuth } from "../../procedures";
import { env } from "@/lib/env";
import { BridgeUser } from "@/lib/models/bridge-user";
import { BankAccount } from "@/lib/models/bank-account";
import { BridgeTransfer } from "@/lib/models/bridge-transfer";
import { TOKEN_MINTS } from "@/lib/constants/tokens";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { fiatContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";
import {
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
  getTransactionFee,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";

// Helper functions
const usdToUsdc = (usdAmount: string) => {
  if (!usdAmount || isNaN(parseFloat(usdAmount))) return null;
  return (parseFloat(usdAmount) * Math.pow(10, 6)).toString();
};

const usdcToUsd = (usdcAmount: string) => {
  return parseFloat(usdcAmount) / Math.pow(10, 6);
};

const usdCeil = (amount: number) => {
  return Math.ceil(amount * Math.pow(10, 2)) / Math.pow(10, 2);
};

// ============================================================================
// Procedures
// ============================================================================

const getKycStatus = publicProcedure.fiat.getKycStatus
  .use(withAuth)
  .handler(async ({ context, errors }) => {
    const privyUser = context.session.user;

    if (!privyUser.email) {
      throw errors.EMAIL_NOT_LINKED({ message: "Email not linked" });
    }

    const bridgeUser = await BridgeUser.findOne({
      where: { privyUserId: privyUser.id },
    });

    if (bridgeUser) {
      return {
        kycStatus: bridgeUser.kycStatus,
        tosStatus: bridgeUser.tosStatus,
        tosLink: bridgeUser.tosLink,
        kycLink: bridgeUser.kycLink,
        kycLinkId: bridgeUser.kycLinkId,
        accountType: bridgeUser.accountType,
      };
    }

    return {
      kycStatus: "not_started",
      tosStatus: "pending",
      tosLink: null,
      kycLink: null,
      kycLinkId: null,
    };
  });

const initKyc = publicProcedure.fiat.initKyc
  .use(withAuth)
  .handler(async ({ input, context, errors }) => {
    const { type } = input;
    const privyUser = context.session.user;

    if (!privyUser.email) {
      throw errors.EMAIL_NOT_LINKED({ message: "Email not linked" });
    }

    let bridgeUser = await BridgeUser.findOne({
      where: { privyUserId: privyUser.id },
    });

    if (bridgeUser && !bridgeUser.accountType && type) {
      bridgeUser.accountType = type;
      await bridgeUser.save();
    }

    if (
      bridgeUser?.kycStatus === "approved" &&
      bridgeUser?.tosStatus === "approved"
    ) {
      return {
        kycStatus: bridgeUser.kycStatus,
        tosStatus: bridgeUser.tosStatus,
        tosLink: bridgeUser.tosLink,
        kycLink: bridgeUser.kycLink,
        kycLinkId: bridgeUser.kycLinkId,
        accountType: bridgeUser.accountType,
      };
    }

    let rejectionReasons: string[] = [];

    if (!bridgeUser) {
      const response = await fetch(`${env.BRIDGE_API_URL}/kyc_links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": env.BRIDGE_API_KEY,
          "Idempotency-Key": uuidv4(),
        },
        body: JSON.stringify({
          email: privyUser.email.address,
          type: type || "individual",
          redirect_uri: `${
            process.env.NEXT_PUBLIC_APP_URL
          }/withdraw?step=5&type=${type || "individual"}`,
        }),
      });

      let data = await response.json();
      const existsAlready = data.existing_kyc_link;
      if (existsAlready) {
        data = data.existing_kyc_link;
      }

      if (!response.ok && !existsAlready) {
        console.error("Failed to create Bridge KYC link", data);
        throw errors.BRIDGE_ERROR({
          message: "Failed to create Bridge KYC link",
        });
      }

      const [newBridgeUser] = await BridgeUser.findOrCreate({
        where: { privyUserId: privyUser.id },
        defaults: {
          privyUserId: privyUser.id,
          kycLinkId: data.id,
          kycStatus: data.kyc_status,
          tosStatus: data.tos_status,
          tosLink: data.tos_link,
          kycLink: data.kyc_link,
          bridgeCustomerId: data.customer_id,
          accountType: type || "individual",
        },
      });

      bridgeUser = newBridgeUser;
    } else {
      const response = await fetch(
        `${env.BRIDGE_API_URL}/kyc_links/${bridgeUser.kycLinkId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": env.BRIDGE_API_KEY,
          },
        },
      );

      if (!response.ok) {
        throw errors.BRIDGE_ERROR({ message: "Failed to get Bridge KYC link" });
      }

      const data = await response.json();
      if (process.env.BRIDGE_API_URL?.includes("sandbox")) {
        bridgeUser.tosStatus = "approved";
      } else {
        bridgeUser.tosStatus = data.tos_status;
      }
      bridgeUser.kycStatus = data.kyc_status;
      bridgeUser.tosLink = data.tos_link;
      bridgeUser.kycLink = data.kyc_link;
      await bridgeUser.save();
      rejectionReasons = (data.rejection_reasons || []).map(
        (r: { reason: string }) => r.reason,
      );
    }

    return {
      kycStatus: bridgeUser.kycStatus,
      tosStatus: bridgeUser.tosStatus,
      tosLink: bridgeUser.tosLink,
      kycLink: bridgeUser.kycLink,
      kycLinkId: bridgeUser.kycLinkId,
      accountType: bridgeUser.accountType,
      rejectionReasons,
    };
  });

const getFees = publicProcedure.fiat.getFees.handler(async () => {
  const developerFee = process.env.BRIDGE_DEVELOPER_FEE || "0.50";
  const developerFeePercentage =
    process.env.BRIDGE_DEVELOPER_FEE_PERCENTAGE || "0.5";

  return {
    developer_fee: developerFee,
    developer_fee_percent: parseFloat(developerFeePercentage),
  };
});

const listBankAccounts = publicProcedure.fiat.listBankAccounts
  .use(withAuth)
  .handler(async ({ context, errors }) => {
    const privyUser = context.session.user;

    const bridgeUser = await BridgeUser.findOne({
      where: { privyUserId: privyUser.id },
    });

    if (!bridgeUser?.bridgeCustomerId) {
      throw errors.NOT_FOUND({ message: "Bridge customer ID not found" });
    }

    const bankAccounts = await BankAccount.findAll({
      where: { bridgeUserId: bridgeUser.id },
    });

    return bankAccounts.map((account) => account.toJSON());
  });

const createBankAccount = publicProcedure.fiat.createBankAccount
  .use(withAuth)
  .handler(async ({ input, context, errors }) => {
    const privyUser = context.session.user;

    const bridgeUser = await BridgeUser.findOne({
      where: { privyUserId: privyUser.id },
    });

    if (!bridgeUser?.bridgeCustomerId || !bridgeUser.id) {
      throw errors.NO_CUSTOMER({ message: "Bridge customer ID not found" });
    }

    const {
      currency,
      account_type,
      bank_name,
      account_name,
      first_name,
      last_name,
      account_owner_name,
      business_name,
      account,
      address,
    } = input;

    const bankAccountResponse = await fetch(
      `${env.BRIDGE_API_URL}/customers/${bridgeUser.bridgeCustomerId}/external_accounts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": env.BRIDGE_API_KEY,
          "Idempotency-Key": uuidv4(),
        },
        body: JSON.stringify({
          currency,
          account_type,
          bank_name,
          account_name,
          first_name,
          last_name,
          account_owner_type: bridgeUser.accountType,
          account_owner_name,
          ...(business_name && { business_name }),
          account: {
            routing_number: account.routing_number,
            account_number: account.account_number,
            checking_or_savings: account.checking_or_savings,
          },
          address: {
            street_line_1: address.street_line_1,
            country: address.country,
            state: address.state,
            city: address.city,
            postal_code: address.postal_code,
          },
        }),
      },
    );

    if (!bankAccountResponse.ok) {
      const errorData = await bankAccountResponse.json();
      console.error("Failed to add bank account", errorData);
      throw errors.BRIDGE_ERROR({
        message: errorData.message || "Failed to add bank account",
      });
    }

    const bankAccountData = await bankAccountResponse.json();

    const bankAccount = await BankAccount.create({
      bridgeUserId: bridgeUser.id,
      bridgeExternalAccountId: bankAccountData.id,
      accountName: account_name,
      bankName: bank_name,
      lastFourDigits: account.account_number.slice(-4),
      routingNumber: account.routing_number,
      accountType: account.checking_or_savings,
    });

    return bankAccount.toJSON();
  });

const deleteBankAccount = publicProcedure.fiat.deleteBankAccount
  .use(withAuth)
  .handler(async ({ input, context, errors }) => {
    const { id } = input;
    const privyUser = context.session.user;

    const bridgeUser = await BridgeUser.findOne({
      where: { privyUserId: privyUser.id },
    });

    if (!bridgeUser?.bridgeCustomerId) {
      throw errors.NO_CUSTOMER({ message: "Bridge customer ID not found" });
    }

    const bankAccount = await BankAccount.findOne({
      where: { bridgeExternalAccountId: id },
    });

    const response = await fetch(
      `${env.BRIDGE_API_URL}/customers/${bridgeUser.bridgeCustomerId}/external_accounts/${id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": env.BRIDGE_API_KEY,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to delete bank account", errorData);
      throw errors.BRIDGE_ERROR({
        message: errorData.message || "Failed to delete bank account",
      });
    }

    await bankAccount?.destroy();

    return { success: true };
  });

const getSendQuote = publicProcedure.fiat.getSendQuote.handler(
  async ({ input, errors }) => {
    const { usdAmount } = input;

    const usdcAmount = usdToUsdc(usdAmount);
    if (!usdcAmount) {
      throw errors.BAD_REQUEST({ message: "Invalid USD amount" });
    }

    const quoteResponse = await fetch(
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${HNT_MINT.toBase58()}&outputMint=${
        TOKEN_MINTS.USDC
      }&swapMode=ExactOut&amount=${usdcAmount}&slippageBps=50`,
    );

    if (!quoteResponse.ok) {
      throw errors.JUPITER_ERROR({
        message: "Failed to get quote from Jupiter",
      });
    }

    return await quoteResponse.json();
  },
);

const sendFunds = publicProcedure.fiat.sendFunds.handler(
  async ({ input, errors }) => {
    const { id, userAddress, quoteResponse } = input;

    const bankAccount = await BankAccount.findByPk(id, {
      include: [
        {
          as: "bridgeUser",
          model: BridgeUser,
          attributes: ["bridgeCustomerId"],
        },
      ],
    });

    if (!bankAccount) {
      throw errors.NOT_FOUND({ message: "Bank account not found" });
    }

    // Cancel any existing transfers
    const existingTransfers = await BridgeTransfer.findAll({
      where: {
        bridgeUserId: bankAccount.bridgeUserId,
        solanaSignature: { [Op.is]: null } as unknown as string,
        state: { [Op.notIn]: ["cancelled", "failed"] },
      },
    });

    for (const transfer of existingTransfers) {
      try {
        await fetch(
          `https://api.bridge.xyz/v0/transfers/${transfer.bridgeTransferId}`,
          {
            method: "DELETE",
            headers: {
              "Api-Key": process.env.BRIDGE_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          },
        );
        await transfer.destroy();
      } catch (e) {
        console.error("Error cancelling transfer:", e);
      }
    }

    // Create transfer with Bridge
    const fee = (
      parseFloat(process.env.BRIDGE_DEVELOPER_FEE || "0.50") +
      usdCeil(
        (parseFloat(process.env.BRIDGE_DEVELOPER_FEE_PERCENTAGE || "0.5") /
          100) *
          usdcToUsd(quoteResponse.outAmount),
      )
    ).toString();

    const bridgeTransferResponse = await fetch(
      "https://api.bridge.xyz/v0/transfers",
      {
        method: "POST",
        headers: {
          "Api-Key": process.env.BRIDGE_API_KEY!,
          "Content-Type": "application/json",
          "Idempotency-Key": uuidv4(),
        },
        body: JSON.stringify({
          on_behalf_of: bankAccount.bridgeUser!.bridgeCustomerId,
          amount: usdcToUsd(quoteResponse.outAmount).toString(),
          developer_fee: fee,
          source: {
            payment_rail: "solana",
            currency: "usdc",
            from_address: userAddress,
          },
          destination: {
            payment_rail: "ach",
            currency: "usd",
            external_account_id: bankAccount.bridgeExternalAccountId,
          },
        }),
      },
    );

    if (!bridgeTransferResponse.ok) {
      const error = await bridgeTransferResponse.json();
      throw errors.BRIDGE_ERROR({
        message: error.message || "Failed to create Bridge transfer",
      });
    }

    const bridgeTransfer = await bridgeTransferResponse.json();
    const destination = bridgeTransfer.source_deposit_instructions.to_address;

    const ata = getAssociatedTokenAddressSync(
      new PublicKey(TOKEN_MINTS.USDC),
      new PublicKey(destination),
      true,
    );

    await BridgeTransfer.create({
      bridgeTransferId: bridgeTransfer.id,
      bridgeUserId: bankAccount.bridgeUserId,
      bankAccountId: bankAccount.id!,
      amount: quoteResponse.outAmount,
      state: bridgeTransfer.state,
    });

    // Get swap instructions from Jupiter
    const connection = new Connection(process.env.SOLANA_RPC_URL!);
    const myUsdcAta = getAssociatedTokenAddressSync(
      new PublicKey(TOKEN_MINTS.USDC),
      new PublicKey(userAddress),
      true,
    );

    // Check wallet has sufficient balance for potential ATA creations (user + dest USDC)
    let rentCost = 0;
    const userAtaInfo = await connection.getAccountInfo(myUsdcAta);
    if (!userAtaInfo) {
      rentCost += RENT_COSTS.ATA;
    }
    const destAtaInfo = await connection.getAccountInfo(ata);
    if (!destAtaInfo) {
      rentCost += RENT_COSTS.ATA;
    }

    if (rentCost > 0) {
      const walletBalance = await connection.getBalance(
        new PublicKey(userAddress),
      );
      const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, rentCost);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to complete transfer",
          data: { required, available: walletBalance },
        });
      }
    }

    const instructionsResponse = await fetch(
      "https://lite-api.jup.ag/swap/v1/swap-instructions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: userAddress,
          destinationTokenAccount: myUsdcAta.toBase58(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: 1000000,
              priorityLevel: "medium",
            },
          },
        }),
      },
    );

    const instructions = await instructionsResponse.json();
    if (instructions.error) {
      throw errors.JUPITER_ERROR({
        message: "Failed to get swap instructions: " + instructions.error,
      });
    }

    const deserializeInstruction = (instruction: {
      programId: string;
      accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
      data: string;
    }) => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
      });
    };

    const jupIxs = [
      createAssociatedTokenAccountIdempotentInstruction(
        new PublicKey(userAddress),
        myUsdcAta,
        new PublicKey(userAddress),
        new PublicKey(TOKEN_MINTS.USDC),
      ),
      deserializeInstruction(instructions.swapInstruction),
      createAssociatedTokenAccountIdempotentInstruction(
        new PublicKey(userAddress),
        ata,
        new PublicKey(destination),
        new PublicKey(TOKEN_MINTS.USDC),
      ),
      createTransferCheckedInstruction(
        myUsdcAta,
        new PublicKey(TOKEN_MINTS.USDC),
        ata,
        new PublicKey(userAddress),
        BigInt(quoteResponse.outAmount),
        6,
      ),
    ];

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: jupIxs,
        feePayer: new PublicKey(userAddress),
        addressLookupTableAddresses:
          instructions.addressLookupTableAddresses.map(
            (address: string) => new PublicKey(address),
          ),
      },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.BANK_SEND,
      bankAccountId: id,
      userAddress,
      amount: quoteResponse.outAmount,
    });

    return {
      bridgeTransfer,
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "bank_send",
              description: `Withdraw $${(
                parseFloat(quoteResponse.outAmount) / 1e6
              ).toFixed(2)} worth of HNT to Bank Account`,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: { type: "bank_send", usdAmount: (parseFloat(quoteResponse.outAmount) / 1e6).toFixed(2), bankAccountId: id },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(getTransactionFee(tx) + rentCost),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);

const updateTransfer = publicProcedure.fiat.updateTransfer.handler(
  async ({ input, errors }) => {
    const { id, solanaSignature } = input;

    const transfer = await BridgeTransfer.findOne({
      where: { bridgeTransferId: id },
    });

    if (!transfer) {
      throw errors.NOT_FOUND({ message: "Transfer not found" });
    }

    await transfer.update({ solanaSignature });

    return { success: true };
  },
);

// ============================================================================
// Router Export
// ============================================================================

export const fiatRouter = implement(fiatContract).router({
  getKycStatus,
  initKyc,
  getFees,
  listBankAccounts,
  createBankAccount,
  deleteBankAccount,
  getSendQuote,
  sendFunds,
  updateTransfer,
});
