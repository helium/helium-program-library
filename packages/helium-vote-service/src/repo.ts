import simpleGit, { SimpleGit } from "simple-git";
import { HELIUM_VOTE_PROXY_REPO } from "./env";
import { Proxy, ProxyRegistrar } from "./model";
import fs from "fs";
import { Op } from "sequelize";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { getRegistrarKey } from "@helium/voter-stake-registry-sdk";

const git: SimpleGit = simpleGit();

const networksToRegistrars = {
  HNT: getRegistrarKey(HNT_MINT).toBase58(),
  MOBILE: getRegistrarKey(MOBILE_MINT).toBase58(),
  IOT: getRegistrarKey(IOT_MINT).toBase58(),
};

export const cloneRepo = async () => {
  if (!fs.existsSync("./helium-vote-proxies")) {
    await git.clone(HELIUM_VOTE_PROXY_REPO, "./helium-vote-proxies");
  } else {
    await git.cwd("./helium-vote-proxies").pull();
  }
};

export const readProxiesAndUpsert = async () => {
  const proxiesJson = fs.readFileSync(
    "./helium-vote-proxies/proxies.json",
    "utf-8"
  );
  const proxies = JSON.parse(proxiesJson);
  const existingProxiesNotInRepo = await Proxy.findAll({
    where: {
      name: {
        [Op.notIn]: proxies.map((proxy: any) => proxy.name),
      },
    },
  });
  for (const proxy of existingProxiesNotInRepo) {
    await proxy.destroy();
  }
  for (const proxy of proxies) {
    const existingProxy = await Proxy.findOne({
      where: {
        [Op.or]: [{ name: proxy.name }, { wallet: proxy.wallet }],
      },
    });
    if (existingProxy) {
      if (existingProxy.wallet !== proxy.wallet) {
        await existingProxy.destroy();
        await Proxy.create(proxy);
      } else {
        await existingProxy.update(proxy);
      }
    } else {
      await Proxy.create(proxy);
    }
    for (const network of proxy.networks) {
      const registrar = networksToRegistrars[network as keyof typeof networksToRegistrars];
      if (registrar) {
        const proxyRegistrar = {
          registrar,
          wallet: proxy.wallet,
        };
        const existing = await ProxyRegistrar.findOne({
          where: proxyRegistrar,
        });
        if (!existing) {
          await ProxyRegistrar.create(proxyRegistrar);
        }
      }
    }
    delete proxy.networks;
  }
};
