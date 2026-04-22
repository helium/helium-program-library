import { ProxyRegistrar } from "@/lib/models/governance/proxy-registrar";

export async function getProxyRegistrars(wallet: string): Promise<string[]> {
  const rows = await ProxyRegistrar.findAll({ where: { wallet } });
  return rows.map((r) => r.registrar);
}
