import {
  AccountInfo,
  AddressLookupTableAccount,
  Commitment,
  Connection,
  GetMultipleAccountsConfig,
  PublicKey,
  SendOptions,
  TransactionInstruction,
  VersionedMessage,
  VersionedTransaction
} from "@solana/web3.js";
import { EventEmitter } from "./eventEmitter";
import { getMultipleAccounts } from "./getMultipleAccounts";
import { TransactionCompletionQueue } from "./transactionCompletionQueue";

export const DEFAULT_CHUNK_SIZE = 99;
export const DEFAULT_DELAY = 50;

export type TypedAccountParser<T> = (
  pubkey: PublicKey,
  data: AccountInfo<Buffer>
) => T;

export interface ParsedAccountBase<T> {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
  info?: T;
}

export type AccountParser<T> = (
  pubkey: PublicKey,
  data: AccountInfo<Buffer>
) => ParsedAccountBase<T> | undefined;

function getWriteableAccounts(
  instructions: TransactionInstruction[]
): PublicKey[] {
  return instructions
    .flatMap((i) => i.keys)
    .filter((k) => k.isWritable)
    .map((a) => a.pubkey);
}

let id = 0;

let singletons: Record<string, AccountFetchCache | undefined> = {};
export function getSingleton(conn: Connection): AccountFetchCache {
  const commitment = conn.commitment || "confirmed";
  const endp = conn.rpcEndpoint;
  if (!singletons[endp + commitment]) {
    singletons[endp + commitment] = new AccountFetchCache({
      connection: conn,
      commitment,
    });
  }
  return singletons[endp + commitment]!;
}

function setSingleton(conn: Connection, cache: AccountFetchCache) {
  const commitment = conn.commitment || "confirmed";
  const endp = conn.rpcEndpoint;
  singletons[endp + commitment] = cache;
}

export interface AccountCache {
  delete(key: string): void;
  has(key: string): boolean;
  get(key: string): ParsedAccountBase<unknown> | null | undefined;
  set(key: string, value: ParsedAccountBase<unknown> | null): void;
}

export class MapAccountCache implements AccountCache {
  cache = new Map<string, ParsedAccountBase<unknown> | null>() as AccountCache;

  delete(key: string): void {
    this.cache.delete(key);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }
  get(key: string): ParsedAccountBase<unknown> | null | undefined {
    return this.cache.get(key);
  }
  set(key: string, value: ParsedAccountBase<unknown> | null): void {
    this.cache.set(key, value);
  }
}

// Keeps track of a promise representing a batch of accounts to fetch.
// When the promise resolves, it returns a map of pubkey to account info.
class Batcher {
  inFlight = false
  currentBatch = new Set<string>();
  result: Promise<Record<string, AccountInfo<Buffer>>> | null;
  currentBatchResultResolve: (res: Record<string, AccountInfo<Buffer>>) => void = () => {};
  currentBatchResultReject: (e: any) => void = () => {};

  constructor() {
    this.result = new Promise((resolve, reject) => {
      this.currentBatchResultReject = reject
      this.currentBatchResultResolve = resolve
    })
    this.resolve = this.resolve.bind(this);
    this.reject = this.resolve.bind(this);
  }

  start() {
    this.inFlight = true
  }

  resolve(res: Record<string, AccountInfo<Buffer>>) {
    this.currentBatchResultResolve(res)
  }

  reject(e: any) {
    this.currentBatchResultReject(e)
  }

  get keys() {
    return Array.from(this.currentBatch)
  }

  add(...keys: string[]) {
    if (keys.length === 1) {
      this.currentBatch.add(keys[0])
    } else {
      this.currentBatch = new Set([...this.currentBatch, ...keys])
    }
  }
}

export class AccountFetchCache {
  enableLogging: boolean;
  connection: Connection;
  delay: number;
  commitment: Commitment;
  accountWatchersCount = new Map<string, number>();
  accountChangeListeners = new Map<string, number>();
  statics = new Set<string>();
  missingAccounts = new Map<string, AccountParser<unknown> | undefined>();
  genericCache: AccountCache;
  keyToAccountParser = new Map<string, AccountParser<unknown> | undefined>();
  timeout: NodeJS.Timeout | null = null;
  emitter = new EventEmitter();
  // As account requests come in, they get pushed to the list of batches
  // When the batcher is full, it gets flushed to the network. Then a new one is added.
  // There can be multiple in flight batches at the same time.
  activeBatches = [new Batcher()]
  
  id: number; // For debugging, to see which cache is being used

  oldGetAccountinfo?: (
    publicKey: PublicKey,
    com?: Commitment
  ) => Promise<AccountInfo<Buffer> | null>;
  oldGetMultipleAccountsInfo?: (
    publicKeys: PublicKey[],
    com?: Commitment | GetMultipleAccountsConfig
  ) => Promise<(AccountInfo<Buffer> | null)[]>;
  oldSendTransaction: (...args: any[]) => Promise<string>;
  oldSendRawTransaction: (
    rawTransaction: Buffer | Uint8Array | Array<number>,
    options?: SendOptions
  ) => Promise<string>;

  missingInterval: NodeJS.Timeout;

  constructor({
    connection,
    delay = DEFAULT_DELAY,
    commitment,
    missingRefetchDelay = 10000,
    extendConnection = false,
    cache,
    enableLogging = false,
  }: {
    connection: Connection;
    delay?: number;
    commitment: Commitment;
    missingRefetchDelay?: number;
    /** Add functionatility to getAccountInfo that uses the cache */
    extendConnection?: boolean;
    cache?: AccountCache;
    enableLogging?: boolean;
  }) {
    this.enableLogging = enableLogging;
    this.genericCache = cache || new MapAccountCache();

    this.id = ++id;
    this.connection = connection;
    this.delay = delay;
    this.commitment = commitment;
    this.missingInterval = setInterval(
      this.fetchMissing.bind(this),
      missingRefetchDelay
    );

    this.oldSendTransaction = connection.sendTransaction.bind(connection);
    this.oldSendRawTransaction = connection.sendRawTransaction.bind(connection);

    const self = this;

    // @ts-ignore
    if (extendConnection && !connection._accountFetchWrapped) {
      // @ts-ignore
      connection._accountFetchWrapped = true;
      this.oldGetAccountinfo = connection.getAccountInfo.bind(connection);
      this.oldGetMultipleAccountsInfo =
        connection.getMultipleAccountsInfo.bind(connection);

      connection.getAccountInfo = async (
        publicKey: PublicKey,
        com?: Commitment
      ): Promise<AccountInfo<Buffer> | null> => {
        if (
          (com || connection.commitment) == commitment ||
          typeof (com || connection.commitment) == "undefined"
        ) {
          const [result, dispose] = await this.searchAndWatch(publicKey);
          setTimeout(dispose, 30 * 1000); // cache for 30s
          return result?.account || null;
        }

        return self.oldGetAccountinfo!(publicKey, com);
      };

      connection.getMultipleAccountsInfo = async (
        publicKeys: PublicKey[],
        com?: Commitment
      ): Promise<(AccountInfo<Buffer> | null)[]> => {
        if (
          (com || connection.commitment) == commitment ||
          typeof (com || connection.commitment) == "undefined"
        ) {
          const res = await Promise.all(
            publicKeys.map((k) => this.searchAndWatch(k))
          );
          setTimeout(() => {
            res.map(([_, dispose]) => dispose());
          }, 30 * 1000); // cache for 30s
          return res.map(([r]) => r?.account || null);
        }

        return self.oldGetMultipleAccountsInfo!(publicKeys, com);
      };
    }

    const queue = new TransactionCompletionQueue({
      connection,
      log: this.enableLogging,
    });
    connection.sendTransaction = async function overloadedSendTransaction(
      ...args: any[]
    ) {
      const result = await self.oldSendTransaction(...args);

      // First try to requery when confirmed. Then mop up any that didn't change during confirmed.
      queue
        .wait("confirmed", result)
        .then(async () => {
          const instructions = args[0].instructions
            ? args[0].instructions
            : await getInstructions(connection, args[0]);
          return self.requeryMissing(instructions);
        })
        .then(async (unchanged) => {
          if (unchanged.length > 0) {
            await queue.wait("finalized", result);
            return self.requeryMissingByAccount(unchanged);
          }
        })
        .catch(console.error);

      return result;
    };

    connection.sendRawTransaction = async function overloadedSendRawTransaction(
      rawTransaction: Buffer | Uint8Array | Array<number>,
      options?: SendOptions
    ) {
      const result = await self.oldSendRawTransaction(rawTransaction, options);

      try {
        const message = VersionedTransaction.deserialize(
          new Uint8Array(rawTransaction)
        ).message;
        const instructions = await getInstructions(connection, message);

        // First try to requery when confirmed. Then mop up any that didn't change during confirmed.
        queue
          .wait("confirmed", result)
          .then(() => {
            return self.requeryMissing(instructions);
          })
          .then(async (unchanged) => {
            if (unchanged.length > 0) {
              await queue.wait("finalized", result);
              return self.requeryMissingByAccount(unchanged);
            }
          })
          .catch(console.error);
      } catch (e: any) {
        // TODO: handle transaction v2
      }

      return result;
    };

    setSingleton(connection, this);
  }

  // Requeries missin accounts and returns the ones that didn't change
  async requeryMissing(
    instructions: TransactionInstruction[]
  ): Promise<PublicKey[]> {
    const writeableAccounts = Array.from(
      new Set(getWriteableAccounts(instructions).map((a) => a.toBase58()))
    );
    return this.requeryMissingByAccount(
      writeableAccounts.map((a) => new PublicKey(a))
    );
  }

  async requeryMissingByAccount(accounts: PublicKey[]): Promise<PublicKey[]> {
    const writeableAccounts = accounts.map((a) => a.toBase58());
    const unchanged: PublicKey[] = [];
    await Promise.all(
      writeableAccounts.map(async (account) => {
        const parser = this.missingAccounts.get(account);
        const prevAccount = this.genericCache.get(account);
        const [found, dispose] = await this.searchAndWatch(
          new PublicKey(account),
          parser,
          this.statics.has(account),
          true
        );
        dispose();
        const changed =
          (prevAccount && !found) ||
          (found && !prevAccount) ||
          (prevAccount &&
            !found?.account.data.equals(prevAccount.account.data));
        if (!changed) {
          unchanged.push(new PublicKey(account));
        }
        if (found) {
          this.missingAccounts.delete(account);
        }
      })
    );

    return unchanged;
  }

  async fetchMissing() {
    try {
      await Promise.all(
        [...this.missingAccounts].map(
          ([account, _]) =>
            this.searchAndWatch(
              new PublicKey(account),
              this.missingAccounts.get(account),
              this.statics.has(account),
              true
            ).then(([_, dispose]) => dispose()) // Dispose immediately, this isn't watching.
        )
      );
    } catch (e) {
      // This happens in an interval, so just log errors
      console.error(e);
    }
  }

  close() {
    if (this.oldGetAccountinfo) {
      this.connection.getAccountInfo = this.oldGetAccountinfo;
    }
    this.connection.sendTransaction = this.oldSendTransaction;
    this.connection.sendRawTransaction = this.oldSendRawTransaction;
    clearInterval(this.missingInterval);
    this.activeBatches.forEach((batcher) =>
      batcher.reject(new Error("AccountFetchCache closed"))
    );
  }

  async fetchBatch() {
    const batcher = this.activeBatches[this.activeBatches.length - 1];
    this.activeBatches.push(new Batcher());
    if (batcher) {
      batcher.start();
      const resolve = batcher?.resolve;
      const reject = batcher?.reject;
      const currentBatch = batcher?.keys;
      if (currentBatch?.length > 0) {
        try {
          if (this.enableLogging) {
            console.log(`Fetching batch of ${currentBatch.length} accounts`);
          }
          const keys = Array.from(currentBatch);
          const res = await getMultipleAccounts(
            this.connection,
            keys,
            this.commitment
          );
          const grouped = res.keys.reduce((acc, key, index) => {
            const account = res.array[index];
            if (account) {
              acc[key] = account;
            }
            return acc;
          }, {} as Record<string, AccountInfo<Buffer>>);
          resolve && resolve(grouped);
        } catch (e: any) {
          reject && reject(e);
        } finally {
          this.activeBatches = this.activeBatches.filter(q => q != batcher)
        }
      }
    }
  }

  addToBatch(id: PublicKey) {
    const idStr = id.toBase58();

    const batcher = this.activeBatches[this.activeBatches.length - 1];
    batcher.add(idStr);

    this.debounceFetchBatch();
    return batcher
  }

  debounceFetchBatch() {
    this.timeout != null && clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.fetchBatch(), this.delay);
  }

  async flush() {
    this.timeout && clearTimeout(this.timeout);
    await this.fetchBatch();
  }

  async searchMultipleAndWatch<T>(
    pubKeys: PublicKey[],
    parser?: AccountParser<T> | undefined,
    isStatic: Boolean = false, // optimization, set if the data will never change
    forceRequery = false
  ): Promise<{
    accounts: (ParsedAccountBase<T> | undefined)[];
    disposers: (() => void)[];
  }> {
    const data = await this.searchMultiple(
      pubKeys,
      parser,
      isStatic,
      forceRequery
    );
    const disposers = data.map((account) => {
      if (account) {
        const address = account.pubkey.toBase58();
        const cacheEntry = this.genericCache.get(address);
        if (!this.genericCache.has(address) || cacheEntry != account) {
          this.updateCache<T>(address, account || null);
        }
        return this.watch(account.pubkey, parser, !!account.account);
      } else {
        return () => {};
      }
    });
    return { accounts: data, disposers };
  }

  async searchAndWatch<T>(
    pubKey: string | PublicKey,
    parser?: AccountParser<T> | undefined,
    isStatic: Boolean = false, // optimization, set if the data will never change
    forceRequery = false
  ): Promise<[ParsedAccountBase<T> | undefined, () => void]> {
    let id: PublicKey;
    if (typeof pubKey === "string") {
      id = new PublicKey(pubKey);
    } else {
      id = pubKey;
    }
    if (!pubKey) {
      return [undefined, () => {}];
    }

    const address = id.toBase58();

    const data = await this.search(pubKey, parser, isStatic, forceRequery);
    const dispose = this.watch(id, parser, !!data);
    const cacheEntry = this.genericCache.get(address);
    if (!this.genericCache.has(address) || cacheEntry != data) {
      // Should only need to notify if we forced a requery. Otherwise,
      // if the thing wasn't in the cache we're returning to the caller who queried it
      if (forceRequery) {
        this.updateCacheAndRaiseUpdated<T>(address, data || null);
      } else {
        this.updateCache<T>(address, data || null);
      }
    }

    return [data, dispose];
  }

  updateCache<T>(id: string, data: ParsedAccountBase<T> | null) {
    this.genericCache.set(id, data || null);
  }

  async updateCacheAndRaiseUpdated<T>(
    id: string,
    data: ParsedAccountBase<T> | null
  ) {
    const isNew = !this.genericCache.has(id);
    this.updateCache(id, data);

    this.emitter.raiseCacheUpdated(id, isNew, this.keyToAccountParser.get(id));
  }

  static defaultParser: AccountParser<any> = (pubkey, account) => ({
    pubkey,
    account,
  });

  // The same as query, except swallows errors and returns undefined.
  async search<T>(
    pubKey: string | PublicKey,
    parser?: AccountParser<T> | undefined,
    isStatic: Boolean = false, // optimization, set if the data will never change
    forceRequery = false
  ): Promise<ParsedAccountBase<T> | undefined> {
    let id: PublicKey;
    if (typeof pubKey === "string") {
      id = new PublicKey(pubKey);
    } else {
      id = pubKey;
    }

    this.registerParser(id, parser);

    const address = id.toBase58();
    if (isStatic) {
      this.statics.add(address);
    } else if (this.statics.has(address)) {
      this.statics.delete(address); // If trying to use this as not static, need to rm it from the statics list.
    }

    if (forceRequery) {
      this.addToBatch(id);
    }

    if (!forceRequery && this.genericCache.has(address)) {
      const result = this.genericCache.get(address);
      return result == null
        ? undefined
        : (result as ParsedAccountBase<T> | undefined);
    }

    let results = await this.awaitAllInFlight();
    let data = results?.[address];

    if (!data) {
      const batcher = this.addToBatch(id);
      results = (await batcher.result)!;
      data = results?.[address];
    }

    if (!data) {
      return undefined;
    }

    const result = this.getParsed(id, data, parser) || {
      pubkey: id,
      account: data,
      info: undefined,
    };

    // Only set the cache for defined static accounts. Static accounts can change if they go from nonexistant to existant.
    // Rely on searchAndWatch to set the generic cache for everything else.
    // Never update the cache with an account that isn't being watched. This could cause
    // stale data to be returned.
    if (isStatic && result && result.info) {
      this.updateCacheAndRaiseUpdated(address, result);
    }

    return result;
  }

  async awaitAllInFlight() {
    let results = {}
    for (const batch of this.activeBatches) {
      if (batch.inFlight) {
        results = {
          ...(await batch.result),
          ...results,
        };
        this.activeBatches = this.activeBatches.filter(b => b != batch)
      }
    }

    return results
  }

  async searchMultiple<T>(
    pubKeys: PublicKey[],
    parser?: AccountParser<T> | undefined,
    isStatic: Boolean = false,
    forceRequery = false
  ): Promise<(ParsedAccountBase<T> | undefined)[]> {
    const result: (ParsedAccountBase<T> | undefined)[] = new Array(
      pubKeys.length
    );
    const keysToFetch: PublicKey[] = [];
    const indexMap: Record<string, number> = {};

    const inflightResults = await this.awaitAllInFlight()

    // First pass: check cache and prepare keys to fetch
    pubKeys.forEach((key, index) => {
      const address = key.toBase58();
      this.registerParser(key, parser);

      if (isStatic) {
        this.statics.add(address);
      } else if (this.statics.has(address)) {
        this.statics.delete(address);
      }

      if (!forceRequery && this.genericCache.has(address)) {
        result[index] = this.genericCache.get(address) as
          | ParsedAccountBase<T>
          | undefined;
      } else if (inflightResults[address]) {
        result[index] = inflightResults[address]
      } else {
        keysToFetch.push(key);
        indexMap[address] = index;
      }
    });

    // Fetch missing accounts in batches
    if (keysToFetch.length > 0) {
      const batcher = this.activeBatches[this.activeBatches.length - 1]
      batcher.add(...keysToFetch.map((k) => k.toBase58()));
      this.debounceFetchBatch();
      const accounts = await batcher.result;
      keysToFetch.forEach((key) => {
        const address = key.toBase58();
        const index = indexMap[address];
        const account = accounts?.[address];

        if (account) {
          const parsed = this.getParsed(address, account, parser) || {
            pubkey: new PublicKey(address),
            account,
            info: undefined,
          };

          result[index] = parsed;

          if (isStatic && parsed.info) {
            this.updateCache(address, parsed);
          }
        } else {
          result[index] = undefined;
        }
      });
    }

    return result;
  }

  onAccountChange<T>(
    key: PublicKey,
    parser: AccountParser<T> | undefined,
    account: AccountInfo<Buffer>
  ) {
    try {
      const parsed = this.getParsed(key, account, parser);
      const address = key.toBase58();
      this.updateCacheAndRaiseUpdated(address, parsed || null);
    } catch (e: any) {
      console.error("accountFetchCache", "Failed to update account", e);
    }
  }

  watch<T>(
    id: PublicKey,
    parser?: AccountParser<T> | undefined,
    exists: Boolean = true
  ): () => void {
    const address = id.toBase58();
    const isStatic = this.statics.has(address);
    let oldCount = (this.accountWatchersCount.get(address) || 0) + 1;
    this.accountWatchersCount.set(address, oldCount);

    if (exists && !isStatic) {
      // Only websocket watch accounts that exist
      // Don't recreate listeners
      // xNFT doesn't support onAccountChange, so we have to make a new usable connection.
      if (!this.accountChangeListeners.has(address)) {
        try {
          this.accountChangeListeners.set(
            address,
            this.connection.onAccountChange(
              id,
              (account) => {
                this.onAccountChange(id, undefined, account);
              },
              this.commitment
            )
          );
        } catch (e: any) {
          if (e.toString().includes("not implemented")) {
            // @ts-ignore
            this.usableConnection =
              // @ts-ignore
              this.usableConnection ||
              new Connection(
                // @ts-ignore
                this.connection._rpcEndpoint,
                this.commitment
              );
            this.accountChangeListeners.set(
              address,
              // @ts-ignore
              this.usableConnection.onAccountChange(
                id,
                // @ts-ignore
                (account) => this.onAccountChange(id, undefined, account),
                this.commitment
              )
            );
          } else {
            console.error(e);
            throw e;
          }
        }
      }
    } else if (!exists) {
      // Poll accounts that don't exist
      this.missingAccounts.set(
        address,
        parser || this.missingAccounts.get(address)
      );
    }

    return () => {
      const newCount = this.accountWatchersCount.get(address)! - 1;
      this.accountWatchersCount.set(address, newCount);

      if (newCount <= 0) {
        const subscriptionId = this.accountChangeListeners.get(address);
        if (subscriptionId) {
          this.accountChangeListeners.delete(address);
          try {
            this.connection.removeAccountChangeListener(subscriptionId);
          } catch (e: any) {
            if (e.toString().includes("not implemented")) {
              // @ts-ignore
              this.usableConnection.removeAccountChangeListener(subscriptionId);
            }
          }
        }
        this.missingAccounts.delete(address);
      }
    };
  }

  async query<T>(
    pubKey: string | PublicKey,
    parser?: AccountParser<T>
  ): Promise<ParsedAccountBase<T>> {
    const ret = await this.search(pubKey, parser);
    if (!ret) {
      throw new Error("Account not found");
    }

    return ret;
  }

  getParsed<T>(
    id: PublicKey | string,
    obj: AccountInfo<Buffer>,
    parser?: AccountParser<T>
  ): ParsedAccountBase<T> | undefined {
    const address = typeof id === "string" ? id : id?.toBase58();
    this.registerParser(id, parser);
    const deserialize = (this.keyToAccountParser.get(address) ||
      AccountFetchCache.defaultParser) as AccountParser<T>;
    const account = deserialize(new PublicKey(address), obj);
    if (!account) {
      return {
        pubkey: new PublicKey(id),
        account: obj,
      };
    }

    return account;
  }

  get(pubKey: string | PublicKey) {
    let key: string;
    if (typeof pubKey !== "string") {
      key = pubKey.toBase58();
    } else {
      key = pubKey;
    }

    return this.genericCache.get(key);
  }

  delete(pubKey: string | PublicKey) {
    let key: string;
    if (typeof pubKey !== "string") {
      key = pubKey.toBase58();
    } else {
      key = pubKey;
    }

    const subId = this.accountChangeListeners.get(key);
    if (subId) {
      this.connection.removeAccountChangeListener(subId);
      this.accountChangeListeners.delete(key);
    }

    if (this.genericCache.has(key)) {
      this.genericCache.delete(key);
      this.emitter.raiseCacheDeleted(key);
      return true;
    }
    return false;
  }

  byParser<T>(parser: AccountParser<T>) {
    const result: string[] = [];
    for (const id of this.keyToAccountParser.keys()) {
      if (this.keyToAccountParser.get(id) === parser) {
        result.push(id);
      }
    }

    return result;
  }

  registerParser<T>(
    pubkey: PublicKey | string,
    parser: AccountParser<T> | undefined
  ) {
    if (pubkey) {
      const address = typeof pubkey === "string" ? pubkey : pubkey?.toBase58();
      if (parser && !this.keyToAccountParser.get(address)) {
        this.keyToAccountParser.set(address, parser);
        const cached = this.genericCache.get(address);
        if (cached) {
          const parsed = parser(cached.pubkey, cached.account);
          if (parsed) {
            this.updateCache(address, parsed);
          }
        }
      }
    }

    return pubkey;
  }
}

async function getInstructions(
  connection: Connection,
  message: VersionedMessage
): Promise<TransactionInstruction[]> {
  const LUTs = await getAddressLookupTableAccounts(
    connection,
    message.addressTableLookups.map((lut) => lut.accountKey)
  );
  const allAccs = message.getAccountKeys({ addressLookupTableAccounts: LUTs });

  return message.compiledInstructions.map((ix) => {
    return new TransactionInstruction({
      programId: allAccs.get(ix.programIdIndex)!,
      data: Buffer.from(ix.data),
      keys: ix.accountKeyIndexes.map((key) => ({
        pubkey: allAccs.get(key)!,
        isSigner: message.isAccountSigner(key),
        isWritable: message.isAccountWritable(key),
      })),
    });
  });
}

const getAddressLookupTableAccounts = async (
  connection: Connection,
  keys: PublicKey[]
): Promise<AddressLookupTableAccount[]> => {
  if (keys.length == 0) {
    return [];
  }

  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: addressLookupTableAddress,
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};
