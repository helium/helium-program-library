import { PublicKey } from "@solana/web3.js";
import { IPlugin } from "../types";
import {
  handleMiniFanout,
  MiniFanout,
  RewardsRecipient,
  Recipient,
  KeyToAsset,
  HNT_LAZY_DISTRIBUTOR,
} from "./explodeMiniFanoutOwnership";

export const ExplodeRecipientDestinationOwnershipPlugin = ((): IPlugin => {
  const name = "ExplodeRecipientDestinationOwnership";
  const init = async (config: { [key: string]: any }) => {
    const updateOnDuplicateFields: string[] = [];

    const addFields = () => {};

    const processAccount = async (
      account: { [key: string]: any },
      transaction?: any,
      lastBlockHeight?: number | null
    ) => {
      try {
        const prevAccount = await Recipient.findByPk(account.address, {
          transaction,
        });
        const prevDestination =
          prevAccount?.destination || PublicKey.default.toBase58();
        const newDestination =
          account.destination || PublicKey.default.toBase58();

        // If destination hasn't changed, nothing to do
        if (
          prevDestination === newDestination ||
          account.lazyDistributor !== HNT_LAZY_DISTRIBUTOR ||
          (!prevAccount && account.destination === PublicKey.default.toBase58())
        ) {
          return account;
        }

        // Case 1: Previous destination was a mini fanout, need to clean up old shares
        if (prevDestination !== PublicKey.default.toBase58()) {
          await RewardsRecipient.destroy({
            where: {
              asset: account.asset,
              type: "fanout",
            },
            transaction,
          });
        }

        if (newDestination !== PublicKey.default.toBase58()) {
          const newMiniFanout = await MiniFanout.findByPk(newDestination, {
            transaction,
          });

          if (newMiniFanout) {
            await handleMiniFanout(
              account.asset,
              newMiniFanout,
              transaction,
              lastBlockHeight
            );
            return account;
          }

          // Case 3: New destination is a direct recipient (not a mini fanout)
          const kta = await KeyToAsset.findOne({
            where: {
              dao: "BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie",
              asset: account.asset,
            },
            transaction,
          });

          // Only create the rewards recipient if we have the required KeyToAsset data
          if (kta && kta.entityKey && kta.keySerialization) {
            await RewardsRecipient.upsert(
              {
                asset: account.asset,
                owner: newDestination,
                destination: newDestination,
                shares: 100,
                totalShares: 100,
                fixedAmount: 0,
                entityKey: kta.entityKey,
                encodedEntityKey: kta.encodedEntityKey,
                keySerialization: kta.keySerialization,
                type: "direct",
                lastBlockHeight,
              },
              { transaction }
            );
          } else {
            console.warn(
              `Skipping RewardsRecipient creation for asset ${account.asset} - missing KeyToAsset data`
            );
          }
        }

        return account;
      } catch (err) {
        console.error("Error exploding recipient destination ownership", err);
        throw err;
      }
    };

    return {
      updateOnDuplicateFields,
      addFields,
      processAccount,
    };
  };

  return {
    name,
    init,
  };
})();
