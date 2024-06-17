import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { PublicKey } from "@solana/web3.js";
import axios, { AxiosInstance } from "axios";

export type ProxyAssignment = {
  voter: string;
  nextVoter: string;
  index: number;
  address: string;
  asset: string;
  proxyConfig: string;
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
  delegatedVeTokens: string;
  percent: string;
  numProposalsVoted: string;
  numAssignments: string;
  lastVotedAt: Date | null;
};

export type WithRank = {
  numProxies: string;
  rank: string;
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
  choices: { name: string; weight: string; uri: string }[];
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
  private nftProxyProgram: Program<NftProxy> | undefined;
  registrar: PublicKey;

  get config() {
    return {
      registrar: this.registrar.toBase58(),
      baseUrl: this.client?.getUri(),
      rpcEndpoint: this.provider?.connection.rpcEndpoint,
    };
  }

  get provider() {
    return this.nftProxyProgram?.provider;
  }

  // Wrapper arÍound vsr bulk operations that either uses
  // an API or gPA calls
  constructor({
    baseURL,
    program,
    registrar,
    nftProxyProgram,
  }: {
    registrar: PublicKey;
    baseURL?: string;
    program?: Program<VoterStakeRegistry>;
    nftProxyProgram?: Program<NftProxy>;
  }) {
    if (baseURL) {
      this.client = axios.create({ baseURL: baseURL });
    }
    this.program = program;
    this.nftProxyProgram = nftProxyProgram;
    this.registrar = registrar;

    this.mapRoutes = this.mapRoutes.bind(this);
  }

  assetUrl(url: string) {
    return url.replace("./", `${this.client!.getUri()}/helium-vote-proxies/`);
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
          `/v1/registrars/${this.registrar.toBase58()}/votes/${wallet.toBase58()}`,
          {
            params: { limit, page },
          }
        )
      ).data;
    } else {
      throw new Error("This is not supported without an indexer");
    }
  }

  async getRegistrarsForProxy(wallet: PublicKey): Promise<string[]> {
    if (this.client) {
      return (
        await this.client.get(`/v1/proxies/${wallet.toBase58()}/registrars`)
      ).data;
    } else {
      throw new Error("This is not supported without an indexer");
    }
  }

  async getProxyAssignmentsForPosition(
    position: PublicKey,
    minProxyIndex: number = 0
  ): Promise<ProxyAssignment[]> {
    if (this.client) {
      return (
        await this.client.get(
          `/v1/registrars/${this.registrar.toBase58()}/proxy-assignments`,
          {
            params: {
              limit: 10000,
              position: position.toBase58(),
              minIndex: minProxyIndex,
            },
          }
        )
      ).data;
    }

    if (this.nftProxyProgram && this.program) {
      const registrar = await this.program.account.registrar.fetch(
        this.registrar
      );
      const positionAcc = await this.program.account.positionV0.fetch(position);

      return (
        await this.nftProxyProgram.account.proxyAssignmentV0.all([
          {
            memcmp: {
              offset: 8 + 32 + 32,
              bytes: positionAcc.mint.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 8 + 32,
              bytes: registrar.proxyConfig.toBase58(),
            },
          },
        ])
      )
        .sort((a, b) => b.account.index - a.account.index)
        .map((a) => ({
          voter: a.account.voter.toBase58(),
          nextVoter: a.account.nextVoter.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
          proxyConfig: a.account.proxyConfig.toBase58(),
          rentRefund: a.account.rentRefund.toBase58(),
          bumpSeed: a.account.bumpSeed,
          expirationTime: a.account.expirationTime.toString(),
        }));
    } else {
      throw new Error("No nft proxy program or api url");
    }
  }

  async getProxyAssignmentsForWallet(
    wallet: PublicKey,
    minProxyIndex: number = 0
  ): Promise<ProxyAssignment[]> {
    if (this.client) {
      return (
        await this.client.get(
          `/v1/registrars/${this.registrar.toBase58()}/proxy-assignments`,
          {
            params: {
              limit: 10000,
              voter: wallet.toBase58(),
              minIndex: minProxyIndex,
            },
          }
        )
      ).data;
    }

    if (this.nftProxyProgram && this.program) {
      const registrar = await this.program.account.registrar.fetch(
        this.registrar
      );
      return (
        await this.nftProxyProgram.account.proxyAssignmentV0.all([
          {
            memcmp: {
              offset: 8,
              bytes: wallet.toBase58(),
            },
          },
          {
            memcmp: {
              offset: 8 + 32,
              bytes: registrar.proxyConfig.toBase58(),
            },
          },
        ])
      )
        .sort((a, b) => b.account.index - a.account.index)
        .map((a) => ({
          voter: a.account.voter.toBase58(),
          nextVoter: a.account.nextVoter.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
          proxyConfig: a.account.proxyConfig.toBase58(),
          rentRefund: a.account.rentRefund.toBase58(),
          bumpSeed: a.account.bumpSeed,
          expirationTime: a.account.expirationTime.toString(),
        }));
    } else {
      throw new Error("No nft proxy program or api url");
    }
  }

  async getPositionProxies(
    position: PublicKey,
    minIndex: number
  ): Promise<ProxyAssignment[]> {
    if (this.client) {
      return (
        await this.client.get(`/v1/proxy-assignments`, {
          params: { limit: 10000, position, minIndex },
        })
      ).data;
    }

    if (this.nftProxyProgram && this.program) {
      const registrar = await this.program.account.registrar.fetch(
        this.registrar
      );
      const positionAcc = await this.program.account.positionV0.fetch(position);
      return (
        await this.nftProxyProgram.account.proxyAssignmentV0.all([
          {
            memcmp: {
              offset: 8 + 32,
              bytes: registrar.proxyConfig.toBase58(),
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
          voter: a.account.voter.toBase58(),
          nextVoter: a.account.nextVoter.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
          proxyConfig: a.account.proxyConfig.toBase58(),
          rentRefund: a.account.rentRefund.toBase58(),
          bumpSeed: a.account.bumpSeed,
          expirationTime: a.account.expirationTime.toString(),
        }));
    } else {
      throw new Error("No nft proxy program or api url");
    }
  }

  async getProxies({
    page,
    limit,
    query,
  }: {
    page: number;
    limit: number;
    query?: string;
  }): Promise<EnhancedProxy[]> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }
    const response = await this.client.get(
      `/v1/registrars/${this.registrar.toBase58()}/proxies`,
      {
        params: { page, limit, query },
      }
    );
    return response.data.map(this.mapRoutes);
  }

  async getProxy(wallet: PublicKey): Promise<EnhancedProxy & WithRank> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }
    const response = await this.client.get(
      `/v1/registrars/${this.registrar.toBase58()}/proxies/${wallet.toBase58()}`
    );
    return this.mapRoutes(response.data);
  }

  mapRoutes<T extends Proxy>(data: T): T {
    return {
      ...data,
      image: this.assetUrl(data.image),
      detail: this.assetUrl(data.detail),
    };
  }
}
