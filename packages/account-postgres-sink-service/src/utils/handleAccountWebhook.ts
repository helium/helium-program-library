import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Sequelize } from 'sequelize';
import { provider } from './solana';
import database from './database';
import { sanitizeAccount } from './sanitizeAccount';
import cachedIdlFetch from './cachedIdlFetch';
import { FastifyInstance } from 'fastify';
import { IAccountConfig } from '../types';

interface HandleAccountWebhookArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: IAccountConfig[];
  account: any;
  sequelize?: Sequelize;
}

export async function handleAccountWebhook({
  fastify,
  programId,
  accounts,
  account,
  sequelize = database,
}: HandleAccountWebhookArgs) {
  const idl = await cachedIdlFetch.fetchIdl({
    programId: programId.toBase58(),
    provider,
  });

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
  const now = new Date().toISOString();

  try {
    const program = new anchor.Program(idl, programId, provider);
    const data = Buffer.from(account.data[0], account.data[1]);
    let decodedAcc: any;
    let accName: any;

    for (const { type } of accounts) {
      try {
        if (accName) break;
        decodedAcc = program.coder.accounts.decode(type, data);
        accName = type;
      } catch (err) {}
    }

    if (accName) {
      const model = sequelize.models[accName];
      await model.upsert(
        {
          address: account.pubkey,
          refreshed_at: now,
          ...sanitizeAccount(decodedAcc),
        },
        { transaction: t }
      );
    }

    await t.commit();
    fastify.customMetrics.accountWebhookCounter.inc();
  } catch (err) {
    await t.rollback();
    console.error('While inserting, err', err);
    throw err;
  }
}
