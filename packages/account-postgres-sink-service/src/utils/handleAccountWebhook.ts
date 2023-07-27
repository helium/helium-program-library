import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Sequelize } from 'sequelize';
import { provider } from './solana';
import database from './database';
import { sanitizeAccount } from './sanitizeAccount';
import cachedIdlFetch from './cachedIdlFetch';

interface HandleAccountWebhookArgs {
  programId: PublicKey;
  configAccounts: {
    type: string;
    table?: string;
    schema?: string;
  }[];
  account: any;
  sequelize?: Sequelize;
}

export async function handleAccountWebhook({
  programId,
  configAccounts,
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

  for (const { type } of configAccounts) {
    if (!idl.accounts!.find(({ name }) => name === type)) {
      throw new Error(`idl does not have account of type ${type}`);
    }
  }

  const program = new anchor.Program(idl, programId, provider);
  const data = Buffer.from(account.data[0], account.data[1]);
  // decode the account
  let decodedAcc: any;
  let accName: any;
  for (const idlAcc of idl.accounts!) {
    try {
      decodedAcc = program.coder.accounts.decode(idlAcc.name, data);
      accName = idlAcc.name;
    } catch (err) {}
  }

  const now = new Date().toISOString();
  const model = sequelize.models[accName];
  await model.upsert({
    address: account.pubkey,
    refreshed_at: now,
    ...sanitizeAccount(decodedAcc),
  });
}
