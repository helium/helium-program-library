import { Program } from "@coral-xyz/anchor";
import type {
  apiContract,
  DataBurnResponse,
  GetProposalVotesResponse,
  GetProxiesResponse,
  GetProxyAssignmentsResponse,
  GetProxyResponse,
  GetVotesByWalletResponse,
  SubdaoDelegationsResponse,
} from "@helium/blockchain-api";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { PublicKey } from "@solana/web3.js";

type ApiClient = ContractRouterClient<typeof apiContract>;
type GovernanceClient = ApiClient["governance"];

export type Vote = GetProposalVotesResponse[number];
export type ProposalWithVotes = GetVotesByWalletResponse[number];
export type ProxyAssignment = GetProxyAssignmentsResponse[number];
export type EnhancedProxy = GetProxiesResponse[number];
export type PartialEnhancedProxy = NonNullable<GetProxyResponse>;

export type SubDaoDelegationSplit = {
  mobile: number;
  iot: number;
};

export type DataBurnSplit = {
  mobile: number;
  iot: number;
};

export class VoteService {
  private governance: GovernanceClient | undefined;
  private baseURL: string | undefined;
  private program: Program<VoterStakeRegistry> | undefined;
  private nftProxyProgram: Program<NftProxy> | undefined;
  registrar: PublicKey;

  get config() {
    return {
      registrar: this.registrar.toBase58(),
      baseUrl: this.baseURL,
      rpcEndpoint: this.provider?.connection.rpcEndpoint,
    };
  }

  get provider() {
    return this.nftProxyProgram?.provider;
  }

  // Wrapper around vsr bulk operations that either uses
  // the blockchain-api oRPC endpoints or gPA calls.
  // baseURL is the blockchain-api root (e.g. https://api.helium.io); the SDK
  // appends /rpc for the oRPC client and /helium-vote-proxies for proxy assets.
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
      this.baseURL = baseURL.replace(/\/$/, "");
      const link = new RPCLink({ url: `${this.baseURL}/rpc` });
      const client = createORPCClient<ApiClient>(link);
      this.governance = client.governance;
    }
    this.program = program;
    this.nftProxyProgram = nftProxyProgram;
    this.registrar = registrar;

    this.mapAssetUrls = this.mapAssetUrls.bind(this);
  }

  assetUrl(url: string) {
    return url.replace("./", `${this.baseURL}/helium-vote-proxies/`);
  }

  async getSubDaoDelegationSplit(): Promise<SubDaoDelegationSplit> {
    if (this.governance) {
      const result: SubdaoDelegationsResponse =
        await this.governance.getSubdaoDelegations();
      return {
        mobile: Number(result.mobile ?? 0),
        iot: Number(result.iot ?? 0),
      };
    }
    throw new Error("This is not supported without an indexer");
  }

  async getDataBurnSplit(): Promise<DataBurnSplit> {
    if (this.governance) {
      const result: DataBurnResponse = await this.governance.getDataBurn();
      return {
        mobile: Number(result.mobile ?? 0),
        iot: Number(result.iot ?? 0),
      };
    }
    throw new Error("This is not supported without an indexer");
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
    if (this.governance) {
      return await this.governance.getVotesByWallet({
        registrar: this.registrar.toBase58(),
        wallet: wallet.toBase58(),
        page,
        limit,
      });
    }
    throw new Error("This is not supported without an indexer");
  }

  async getVotesForProposal(proposal: PublicKey): Promise<Vote[]> {
    if (this.governance) {
      return await this.governance.getProposalVotes({
        proposalKey: proposal.toBase58(),
      });
    }
    throw new Error("This is not supported without an indexer");
  }

  async getRegistrarsForProxy(wallet: PublicKey): Promise<string[]> {
    if (this.governance) {
      return await this.governance.getProxyRegistrars({
        wallet: wallet.toBase58(),
      });
    }
    throw new Error("This is not supported without an indexer");
  }

  async getProxyAssignmentsForPosition(
    position: PublicKey,
    minProxyIndex: number = 0
  ): Promise<ProxyAssignment[]> {
    if (this.governance) {
      return await this.governance.getProxyAssignments({
        registrar: this.registrar.toBase58(),
        limit: 1000,
        position: position.toBase58(),
        minIndex: minProxyIndex,
      });
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
    }
    throw new Error("No nft proxy program or api url");
  }

  async getProxyAssignmentsForWallet(
    wallet: PublicKey,
    minProxyIndex: number = 0
  ): Promise<ProxyAssignment[]> {
    if (this.governance) {
      return await this.governance.getProxyAssignments({
        registrar: this.registrar.toBase58(),
        limit: 1000,
        voter: wallet.toBase58(),
        minIndex: minProxyIndex,
      });
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
    }
    throw new Error("No nft proxy program or api url");
  }

  async getPositionProxies(
    position: PublicKey,
    minIndex: number
  ): Promise<ProxyAssignment[]> {
    if (this.governance) {
      return await this.governance.getProxyAssignments({
        registrar: this.registrar.toBase58(),
        limit: 1000,
        position: position.toBase58(),
        minIndex,
      });
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
    }
    throw new Error("No nft proxy program or api url");
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
    if (!this.governance) {
      throw new Error("This operation is not supported without an API");
    }
    const result = await this.governance.getProxies({
      registrar: this.registrar.toBase58(),
      page,
      limit,
      query,
    });
    return result.map(this.mapAssetUrls);
  }

  async getProxy(wallet: PublicKey): Promise<PartialEnhancedProxy> {
    if (!this.governance) {
      throw new Error("This operation is not supported without an API");
    }
    const result = await this.governance.getProxy({
      registrar: this.registrar.toBase58(),
      wallet: wallet.toBase58(),
    });
    if (!result) {
      throw new Error(`No proxy found for wallet ${wallet.toBase58()}`);
    }
    return this.mapAssetUrls(result);
  }

  private mapAssetUrls<T extends { image: string | null; detail: string | null }>(
    data: T
  ): T {
    return {
      ...data,
      image: data.image ? this.assetUrl(data.image) : data.image,
      detail: data.detail ? this.assetUrl(data.detail) : data.detail,
    };
  }
}
