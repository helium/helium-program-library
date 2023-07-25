import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Sequelize } from 'sequelize';
import deepEqual from 'deep-equal';
import _omit from 'lodash/omit';
import { SOLANA_URL } from '../env';
import database from './database';
import { sanitizeAccount } from './sanitizeAccount';
import { getTransactionSignaturesUptoBlockTime } from './getTransactionSignaturesUpToBlock';
import { FastifyInstance } from 'fastify';
import { Counter } from 'prom-client';
import { chunks } from './chunks';
interface IntegrityCheckProgramAccountsArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: {
    type: string;
    table?: string;
    schema?: string;
  }[];
  sequelize?: Sequelize;
}

let integrityMetric: Counter;
export const integrityCheckProgramAccounts = async ({
  fastify,
  programId,
  accounts,
  sequelize = database,
}: IntegrityCheckProgramAccountsArgs) => {
  if (!integrityMetric) {
    integrityMetric = new (fastify as any).metrics.client.Counter({
      name: 'integrity_check',
      help: 'Number of corrected records from integrity checker',
    });
  }

  anchor.setProvider(
    anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
  );

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const idl = await anchor.Program.fetchIdl(programId, provider);

  if (!idl) {
    throw new Error(`unable to fetch idl for ${programId}`);
  }

  if (
    !accounts.every(({ type }) =>
      idl.accounts!.some(({ name }) => name === type)
    )
  ) {
    throw new Error('idl does not have every account type');
  }

  const t = await sequelize.transaction();

  try {
    const program = new anchor.Program(idl, programId, provider);
    const currentSlot = await connection.getSlot();
    const twentyFourHoursAgoSlot =
      currentSlot - Math.floor((24 * 60 * 60 * 1000) / 400); // (assuming a slot duration of 400ms)
    const blockTime24HoursAgo = await connection.getBlockTime(
      twentyFourHoursAgoSlot
    );

    if (!blockTime24HoursAgo) {
      throw new Error('Unable to get blocktime from 24 hours ago');
    }

    const transactionSignatures = await getTransactionSignaturesUptoBlockTime({
      programId,
      blockTime: blockTime24HoursAgo,
      provider,
    });

    const uniqueWritableAccounts = new Set<PublicKey>();
    await Promise.all(
      chunks(transactionSignatures, 100).map(async (chunk) => {
        const parsedTransactions = await connection.getParsedTransactions(
          chunk,
          {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          }
        );

        for (const parsed of parsedTransactions) {
          parsed?.transaction.message.accountKeys
            .filter((acc) => acc.writable)
            .map((acc) => uniqueWritableAccounts.add(acc.pubkey));
        }
      })
    );

    const accountInfosWithPk = (
      await Promise.all(
        chunks([...uniqueWritableAccounts.values()], 100).map(
          async (chunk) =>
            await connection.getMultipleAccountsInfo(
              chunk as PublicKey[],
              'confirmed'
            )
        )
      )
    )
      .flat()
      .map((accountInfo, idx) => ({
        pubkey: [...uniqueWritableAccounts.values()][idx],
        ...accountInfo,
      }));

    await Promise.all(
      chunks(accountInfosWithPk, 1000).map(async (chunk) => {
        for (const c of chunk) {
          let decodedAcc: any;
          let accName: any;

          accountTypeLoop: for (const { type } of accounts) {
            try {
              if (accName) break accountTypeLoop;
              decodedAcc = program.coder.accounts.decode(
                type,
                c.data as Buffer
              );
              accName = type;
            } catch (err) {}
          }

          if (accName) {
            const now = new Date().toISOString();
            const omitKeys = ['refreshed_at', 'createdAt'];
            const model = sequelize.models[accName];
            const existing = await model.findByPk(c.pubkey.toBase58());
            const sanitized = {
              refreshed_at: now,
              address: c.pubkey.toBase58(),
              ...sanitizeAccount(decodedAcc),
            };

            const isEqual =
              existing &&
              deepEqual(
                _omit(sanitized, omitKeys),
                _omit(existing.dataValues, omitKeys)
              );

            if (!isEqual) {
              integrityMetric.inc();
              await model.upsert({ ...sanitized }, { transaction: t });
            }
          }
        }
      })
    );
    await t.commit();
  } catch (err) {
    await t.rollback();
    console.error('While inserting, err', err);
    throw err;
  }
};
