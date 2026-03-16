export interface TokenAccount {
  mint: string;
  address: string;
  balance: string;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  priceUsd?: number;
  balanceUsd?: number;
}

export interface TokenBalanceData {
  totalBalanceUsd: number;
  solBalance: number;
  solBalanceUsd: number;
  tokens: TokenAccount[];
}

export interface GetTokenBalancesOptions {
  walletAddress: string;
}
