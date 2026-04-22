import fs from "fs";
import path from "path";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { getRegistrarKey } from "@helium/voter-stake-registry-sdk";
import { Op } from "sequelize";
import simpleGit, { type SimpleGit } from "simple-git";
import { env } from "../env";
import { Proxy } from "../models/governance/proxy";
import { ProxyRegistrar } from "../models/governance/proxy-registrar";

interface ProxySyncServiceConfig {
  intervalMs: number;
  enabled: boolean;
}

interface RepoProxy {
  name: string;
  image: string;
  wallet: string;
  description: string;
  detail: string;
  networks: Array<"HNT" | "MOBILE" | "IOT">;
}

class ProxySyncService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: ProxySyncServiceConfig;
  private git: SimpleGit;

  constructor(
    config: ProxySyncServiceConfig = {
      intervalMs: 10 * 60 * 1000, // 10 minutes
      enabled: env.PROXY_SYNC_ENABLED !== "false",
    },
  ) {
    this.config = config;
    this.git = simpleGit();
  }

  private get repoDir(): string {
    return env.HELIUM_VOTE_PROXIES_DIR ?? "./helium-vote-proxies";
  }

  private get networksToRegistrars(): Record<string, string> {
    return {
      HNT: getRegistrarKey(HNT_MINT).toBase58(),
      MOBILE: getRegistrarKey(MOBILE_MINT).toBase58(),
      IOT: getRegistrarKey(IOT_MINT).toBase58(),
    };
  }

  start(): void {
    if (this.isRunning) {
      console.log("Proxy sync service is already running");
      return;
    }
    if (!this.config.enabled) {
      console.log("Proxy sync service is disabled");
      return;
    }

    console.log(
      `Starting proxy sync service with ${this.config.intervalMs}ms interval`,
    );
    this.isRunning = true;
    this.syncOnce().catch((err) =>
      console.error("Initial proxy sync failed:", err),
    );
    this.intervalId = setInterval(() => {
      this.syncOnce().catch((err) =>
        console.error("Error in proxy sync service:", err),
      );
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("Proxy sync service stopped");
  }

  private async syncOnce(): Promise<void> {
    await this.cloneOrPull();
    await this.readProxiesAndUpsert();
  }

  private async cloneOrPull(): Promise<void> {
    if (!fs.existsSync(this.repoDir)) {
      await this.git.clone(env.HELIUM_VOTE_PROXY_REPO, this.repoDir);
    } else {
      await this.git.cwd(this.repoDir).pull();
    }
  }

  private async readProxiesAndUpsert(): Promise<void> {
    const proxiesJson = fs.readFileSync(
      path.join(this.repoDir, "proxies.json"),
      "utf-8",
    );
    const proxies = JSON.parse(proxiesJson) as RepoProxy[];
    const registrarMap = this.networksToRegistrars;

    const stale = await Proxy.findAll({
      where: { name: { [Op.notIn]: proxies.map((p) => p.name) } },
    });
    for (const proxy of stale) {
      await proxy.destroy();
    }

    for (const proxy of proxies) {
      const existing = await Proxy.findOne({
        where: {
          [Op.or]: [{ name: proxy.name }, { wallet: proxy.wallet }],
        },
      });
      const { networks, ...proxyRecord } = proxy;
      if (existing) {
        if (existing.wallet !== proxy.wallet) {
          await existing.destroy();
          await Proxy.create(proxyRecord);
        } else {
          await existing.update(proxyRecord);
        }
      } else {
        await Proxy.create(proxyRecord);
      }

      for (const network of networks) {
        const registrar = registrarMap[network];
        if (!registrar) continue;
        const existingRegistrar = await ProxyRegistrar.findOne({
          where: { registrar, wallet: proxy.wallet },
        });
        if (!existingRegistrar) {
          await ProxyRegistrar.create({ registrar, wallet: proxy.wallet });
        }
      }
    }
  }
}

export const proxySyncService = new ProxySyncService();
export default ProxySyncService;
