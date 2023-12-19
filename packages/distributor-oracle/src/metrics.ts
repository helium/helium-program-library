import client from "prom-client";

export const register = new client.Registry();
export const totalRewardsGauge = new client.Gauge({
  name: "helium_total_rewards",
  help: "Total number of rewards",
  labelNames: ["dnt_mint"],
});
register.registerMetric(totalRewardsGauge);
