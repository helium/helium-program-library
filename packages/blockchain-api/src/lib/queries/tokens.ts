import { createSolanaConnection } from "@/lib/solana";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  TokenAccount,
  TokenBalanceData,
  GetTokenBalancesOptions,
} from "@/types/tokens";
import { TOKEN_MINTS } from "@/lib/constants/tokens";

// Well-known token info for common Solana tokens
const KNOWN_TOKENS: Record<
  string,
  { symbol: string; name: string; coingeckoId: string; fixedPriceUsd?: number }
> = {
  [TOKEN_MINTS.WSOL]: {
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
  },
  [TOKEN_MINTS.USDC]: {
    symbol: "USDC",
    name: "USD Coin",
    coingeckoId: "usd-coin",
  },
  [TOKEN_MINTS.USDT]: {
    symbol: "USDT",
    name: "Tether",
    coingeckoId: "tether",
  },
  [TOKEN_MINTS.HNT]: {
    symbol: "HNT",
    name: "Helium",
    coingeckoId: "helium",
  },
  [TOKEN_MINTS.MOBILE]: {
    symbol: "MOBILE",
    name: "Helium Mobile",
    coingeckoId: "helium-mobile",
  },
  [TOKEN_MINTS.IOT]: {
    symbol: "IOT",
    name: "Helium IoT",
    coingeckoId: "helium-iot",
  },
  [TOKEN_MINTS.DC]: {
    symbol: "DC",
    name: "Data Credits",
    coingeckoId: "",
    fixedPriceUsd: 0.00001,
  },
};

// Metadata cache and helper functions
const metadataCache: Record<string, Promise<any>> = {};

function getMetadata(uriIn: string | undefined): Promise<any | undefined> {
  const uri = uriIn?.replace(/\0/g, "");
  if (uri) {
    if (!metadataCache[uri]) {
      metadataCache[uri] = fetch(uri.replace(/\0/g, ""), {
        signal: AbortSignal.timeout(3000),
      })
        .then((res) => res.json())
        .catch((err: any) => {
          console.error(`Error at uri ${uri}`, err);
          return undefined;
        });
    }
    return metadataCache[uri];
  }
  return Promise.resolve(undefined);
}

function getMetadataId(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata", "utf-8"), MPL_PID.toBuffer(), mint.toBuffer()],
    MPL_PID
  )[0];
}

const TOKEN_METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const tokenMetadataCache = new Map<
  string,
  { data: { symbol?: string; name?: string; logoURI?: string }; expiry: number }
>();

async function fetchTokenMetadata(
  connection: any,
  mint: string
): Promise<{ symbol?: string; name?: string; logoURI?: string }> {
  const cached = tokenMetadataCache.get(mint);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  try {
    const mintPubkey = new PublicKey(mint);

    // Handle native SOL
    if (mintPubkey.equals(NATIVE_MINT)) {
      const data = {
        symbol: "SOL",
        name: "SOL",
        logoURI: `https://github.com/solana-labs/token-list/blob/main/assets/mainnet/${TOKEN_MINTS.WSOL}/logo.png?raw=true`,
      };
      tokenMetadataCache.set(mint, {
        data,
        expiry: Date.now() + TOKEN_METADATA_TTL_MS,
      });
      return data;
    }

    // Handle USDC
    const USDC = new PublicKey(TOKEN_MINTS.USDC);
    if (mintPubkey.equals(USDC)) {
      const data = {
        symbol: "USDC",
        name: "USDC",
        logoURI: `https://github.com/solana-labs/token-list/blob/main/assets/mainnet/${TOKEN_MINTS.USDC}/logo.png?raw=true`,
      };
      tokenMetadataCache.set(mint, {
        data,
        expiry: Date.now() + TOKEN_METADATA_TTL_MS,
      });
      return data;
    }

    const metadataAddr = getMetadataId(mintPubkey);
    const metadataAccount = await connection.getAccountInfo(metadataAddr);

    if (!metadataAccount) {
      const data = {};
      tokenMetadataCache.set(mint, {
        data,
        expiry: Date.now() + TOKEN_METADATA_TTL_MS,
      });
      return data;
    }

    const metadata = Metadata.fromAccountInfo(metadataAccount)[0];
    if (!metadata) {
      const data = {};
      tokenMetadataCache.set(mint, {
        data,
        expiry: Date.now() + TOKEN_METADATA_TTL_MS,
      });
      return data;
    }

    // Fetch JSON metadata from URI
    const json = await getMetadata(metadata.data.uri.trim());

    const data = {
      symbol: json?.symbol || metadata.data?.symbol,
      name: json?.name || metadata.data?.name,
      logoURI: json?.image,
    };
    tokenMetadataCache.set(mint, {
      data,
      expiry: Date.now() + TOKEN_METADATA_TTL_MS,
    });
    return data;
  } catch (error) {
    console.error(`Failed to fetch metadata for mint ${mint}:`, error);
    return {};
  }
}

async function fetchTokenPrices(
  coingeckoIds: string[]
): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) return {};

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(
        ","
      )}&vs_currencies=usd`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) return {};

    const data = await response.json();
    return Object.keys(data).reduce((acc, key) => {
      acc[key] = data[key].usd;
      return acc;
    }, {} as Record<string, number>);
  } catch (error) {
    console.error("Failed to fetch token prices:", error);
    return {};
  }
}

export async function getTokenBalances({
  walletAddress,
}: GetTokenBalancesOptions): Promise<TokenBalanceData> {
  const { connection } = createSolanaConnection(walletAddress);
  const publicKey = new PublicKey(walletAddress);

  const solBalance = await connection.getBalance(publicKey);
  const solBalanceInSol = solBalance / 1e9;

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );

  const tokens: TokenAccount[] = [];
  const coingeckoIds: string[] = [];
  const mintToCoingeckoId: Record<string, string> = {};

  for (const tokenAccount of tokenAccounts.value) {
    const accountData = tokenAccount.account.data.parsed;
    const tokenInfo = accountData.info;

    if (
      typeof tokenInfo.tokenAmount.uiAmount !== "undefined" &&
      tokenInfo.tokenAmount.uiAmount !== null
    ) {
      const mint = tokenInfo.mint;
      const knownToken = KNOWN_TOKENS[mint];

      // Only process tokens that are in KNOWN_TOKENS
      if (knownToken) {
        const token: TokenAccount = {
          mint,
          address: tokenAccount.pubkey.toString(),
          balance: tokenInfo.tokenAmount.amount.toString(),
          decimals: tokenInfo.tokenAmount.decimals,
          uiAmount: tokenInfo.tokenAmount.uiAmount,
          symbol: knownToken.symbol,
          name: knownToken.name,
        };

        if (knownToken.coingeckoId) {
          coingeckoIds.push(knownToken.coingeckoId);
          mintToCoingeckoId[mint] = knownToken.coingeckoId;
        }
        tokens.push(token);
      }
    }
  }

  coingeckoIds.push("solana");
  const prices = await fetchTokenPrices(coingeckoIds);
  const solPriceUsd = prices["solana"] || 0;

  // Enhance tokens with Metaplex metadata
  const enhancedTokens = await Promise.all(
    tokens.map(async (token) => {
      const metadata = await fetchTokenMetadata(connection, token.mint);
      return {
        ...token,
        symbol: metadata.symbol || token.symbol,
        name: metadata.name || token.name,
        logoURI: metadata.logoURI || token.logoURI,
      };
    })
  );

  // Apply prices to enhanced tokens
  enhancedTokens.forEach((token) => {
    const coingeckoId = mintToCoingeckoId[token.mint];
    if (coingeckoId && prices[coingeckoId]) {
      token.priceUsd = prices[coingeckoId];
      token.balanceUsd = token.uiAmount * prices[coingeckoId];
    } else {
      const fixedPrice = KNOWN_TOKENS[token.mint]?.fixedPriceUsd;
      if (fixedPrice !== undefined) {
        token.priceUsd = fixedPrice;
        token.balanceUsd = token.uiAmount * fixedPrice;
      }
    }
  });

  const solBalanceUsd = solBalanceInSol * solPriceUsd;
  const tokenBalanceUsd = enhancedTokens.reduce(
    (sum, token) => sum + (token.balanceUsd || 0),
    0
  );
  const totalBalanceUsd = tokenBalanceUsd;

  // Sort enhanced tokens by USD value
  const sortedTokens = enhancedTokens.sort((a, b) => {
    const aValue = a.balanceUsd || 0;
    const bValue = b.balanceUsd || 0;

    if (aValue !== bValue) {
      return bValue - aValue;
    }

    return b.uiAmount - a.uiAmount;
  });

  return {
    totalBalanceUsd,
    solBalance: solBalanceInSol,
    solBalanceUsd,
    tokens: sortedTokens,
  };
}
