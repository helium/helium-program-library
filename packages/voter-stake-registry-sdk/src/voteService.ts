import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { NftDelegation } from "@helium/modular-governance-idls/lib/types/nft_delegation";
import { PublicKey } from "@solana/web3.js";
import axios, { AxiosInstance } from "axios";

export type Delegation = {
  owner: string;
  nextOwner: string;
  index: number;
  address: string;
  asset: string;
  delegationConfig: string;
  bumpSeed: number;
  rentRefund: string;
  expirationTime: string;
};

export type Proxy = {
  name: string;
  image: string;
  wallet: string;
  description: string;
  detail: string;
};

export type EnhancedProxyData = {
  numDelegations: string;
  delegatedVeTokens: string;
  percent: string;
};

export type EnhancedProxy = Proxy & EnhancedProxyData;

export type Proposal = {
  address: string;
  namespace: string;
  owner: string;
  state: object;
  created_at: number;
  proposal_config: string;
  max_choices_per_voter: number;
  seed: Buffer;
  name: string;
  uri: string;
  tags: string[];
  choices: object[];
  bump_seed: number;
  refreshed_at: Date;
};

export type ProposalWithVotes = Proposal & {
  votes: {
    voter: string;
    registrar: string;
    weight: string;
    choice: number;
    choiceName: string;
  }[];
};

export class VoteService {
  private client: AxiosInstance | undefined;
  private program: Program<VoterStakeRegistry> | undefined;
  private nftDelegationProgram: Program<NftDelegation> | undefined;
  private registrar: PublicKey;

  // Wrapper arÍound vsr bulk operations that either uses
  // an API or gPA calls
  constructor({
    baseURL,
    program,
    registrar,
    nftDelegationProgram,
  }: {
    registrar: PublicKey;
    baseURL?: string;
    program?: Program<VoterStakeRegistry>;
    nftDelegationProgram?: Program<NftDelegation>;
  }) {
    if (baseURL) {
      this.client = axios.create({ baseURL: baseURL });
    }
    this.program = program;
    this.nftDelegationProgram = nftDelegationProgram;
    this.registrar = registrar;
  }

  getAssetUrl(baseUrl: string) {
    return baseUrl.replace(
      "./",
      `${this.client!.getUri()}/helium-vote-proxies/`
    );
  }

  async getVotesForWallet({
    wallet,
    page,
    limit = 1000,
  }: {
    wallet: PublicKey;
    page: number;
    limit: number;
  }): Promise<ProposalWithVotes[]> {
    if (this.client) {
      return (
        await this.client.get(
          `/registrars/${this.registrar.toBase58()}/votes/${wallet.toBase58()}`,
          {
            params: { limit, page },
          }
        )
      ).data;
    } else {
      throw new Error("This is not supported without an indexer");
    }
  }

  async getDelegationsForWallet(
    wallet: PublicKey,
    minDelegationIndex: number = 0
  ): Promise<Delegation[]> {
    if (this.client) {
      return (
        await this.client.get(`/delegations`, {
          params: {
            limit: 10000,
            owner: wallet.toBase58(),
            minIndex: minDelegationIndex,
          },
        })
      ).data;
    }

    if (this.nftDelegationProgram && this.program) {
      const registrar = await this.program.account.registrar.fetch(
        this.registrar
      );
      return (
        await this.nftDelegationProgram.account.delegationV0.all([
          {
            memcmp: {
              offset: 8,
              bytes: wallet.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 8 + 32,
              bytes: registrar.delegationConfig.toBase58(),
            },
          },
        ])
      )
        .sort((a, b) => b.account.index - a.account.index)
        .map((a) => ({
          owner: a.account.owner.toBase58(),
          nextOwner: a.account.nextOwner.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
          delegationConfig: a.account.delegationConfig.toBase58(),
          rentRefund: a.account.rentRefund.toBase58(),
          bumpSeed: a.account.bumpSeed,
          expirationTime: a.account.expirationTime.toString(),
        }));
    } else {
      throw new Error("No nft delegation program or api url");
    }
  }

  async getPositionDelegations(
    position: PublicKey,
    minIndex: number
  ): Promise<Delegation[]> {
    if (this.client) {
      return (
        await this.client.get(`/delegations`, {
          params: { limit: 10000, position, minIndex },
        })
      ).data;
    }

    if (this.nftDelegationProgram && this.program) {
      const registrar = await this.program.account.registrar.fetch(
        this.registrar
      );
      const positionAcc = await this.program.account.positionV0.fetch(position);
      return (
        await this.nftDelegationProgram.account.delegationV0.all([
          {
            memcmp: {
              offset: 8 + 32,
              bytes: registrar.delegationConfig.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 8 + 32 + 32,
              bytes: positionAcc.mint.toBase58(),
            },
          },
        ])
      )
        .filter((a) => a.account.index >= minIndex)
        .sort((a, b) => b.account.index - a.account.index)
        .map((a) => ({
          owner: a.account.owner.toBase58(),
          nextOwner: a.account.nextOwner.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
          delegationConfig: a.account.delegationConfig.toBase58(),
          rentRefund: a.account.rentRefund.toBase58(),
          bumpSeed: a.account.bumpSeed,
          expirationTime: a.account.expirationTime.toString(),
        }));
    } else {
      throw new Error("No nft delegation program or api url");
    }
  }

  async getProxies({
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }): Promise<EnhancedProxy[]> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }
    const response = await this.client.get(
      `/registrars/${this.registrar.toBase58()}/proxies`,
      {
        params: { page, limit },
      }
    );
    return response.data;
  }

  async getProxy(wallet: string): Promise<EnhancedProxy> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }
    const response = await this.client.get(
      `/registrars/${this.registrar.toBase58()}/proxies/${wallet}`
    );
    return response.data;
  }

  async searchProxies({ query }: { query: string }): Promise<Proxy[]> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }

    const response = await this.client.get(
      `/registrar/${this.registrar.toBase58()}/proxies/search`,
      {
        params: { query },
      }
    );
    return response.data;
  }
}
