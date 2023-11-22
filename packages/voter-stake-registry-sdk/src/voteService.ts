import { IdlAccounts, Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { NftDelegation } from "@helium/modular-governance-idls/lib/types/nft_delegation";
import axios, { AxiosInstance } from "axios";
import { PublicKey } from "@solana/web3.js";

export type Delegation = {
  owner: string;
  nextOwner: string;
  index: number;
  address: string;
  asset: string;
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

  async getMyDelegations(wallet: PublicKey): Promise<Delegation[]> {
    if (this.client) {
      return (
        await this.client.get(`/delegations`, {
          params: { limit: 10000, owner: wallet.toBase58() },
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
        }));
    } else {
      throw new Error("No nft delegation program or api url");
    }
  }

  async getPositionDelegations(position: PublicKey): Promise<Delegation[]> {
    if (this.client) {
      return (
        await this.client.get(`/delegations`, {
          params: { limit: 10000, position },
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
        .sort((a, b) => b.account.index - a.account.index)
        .map((a) => ({
          owner: a.account.owner.toBase58(),
          nextOwner: a.account.nextOwner.toBase58(),
          index: a.account.index,
          address: a.publicKey.toBase58(),
          asset: a.account.asset.toBase58(),
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
  }): Promise<any> {
    if (!this.client) {
      throw new Error("This operation is not supported without an API");
    }
    const response = await this.client.get(
      `/registrar/${this.registrar.toBase58()}/proxies`,
      {
        params: { page, limit },
      }
    );
    return response.data;
  }

  async searchProxies({ query }: { query: string }): Promise<any> {
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
