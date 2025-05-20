import { Op } from "sequelize";
import { Cursor, database } from "./database";

export const CursorManager = (
  service: string,
  stalenessThreshold: number,
  onStale?: () => void
) => {
  const CURSOR_UPDATE_INTERVAL = 30_000;
  let checkInterval: NodeJS.Timeout | undefined;
  let lastReceivedBlock: number = Date.now();
  let pendingCursor: {
    cursor: string;
    blockHeight: string;
    service: string;
  } | null = null;
  let lastCursorUpdate = 0;

  const formatStaleness = (staleness: number): string => {
    const stalenessInHours = staleness / 3600000;
    return stalenessInHours >= 1
      ? `${stalenessInHours.toFixed(1)}h`
      : `${(staleness / 60000).toFixed(1)}m`;
  };

  const getLatestCursor = async (): Promise<Cursor | null> =>
    await Cursor.findOne({
      where: { service },
      order: [["createdAt", "DESC"]],
    });

  const recordBlockReceived = (): void => {
    lastReceivedBlock = Date.now();
  };

  const updateCursor = async ({
    cursor,
    blockHeight,
    force = false,
  }: {
    cursor: string;
    blockHeight: string;
    force?: boolean;
  }): Promise<void> => {
    const now = Date.now();
    recordBlockReceived();
    pendingCursor = { cursor, blockHeight, service };

    if (force || now - lastCursorUpdate >= CURSOR_UPDATE_INTERVAL) {
      if (pendingCursor) {
        await database.transaction(async (t) => {
          await Cursor.upsert(pendingCursor!, {
            conflictFields: ["service"],
            transaction: t,
          });

          await Cursor.destroy({
            where: {
              service,
              cursor: { [Op.ne]: cursor },
            },
            transaction: t,
          });
        });
        lastCursorUpdate = now;
        pendingCursor = null;
      }
    }
  };

  const checkStaleness = async (): Promise<string | undefined> => {
    const connectionStaleness = Date.now() - lastReceivedBlock;
    if (connectionStaleness >= stalenessThreshold) {
      console.log(
        `Connection is stale (${formatStaleness(
          connectionStaleness
        )} since last block)`
      );
      onStale && onStale();
    }

    const cursor = await getLatestCursor();
    return cursor ? cursor.cursor : undefined;
  };

  const startStalenessCheck = (): void => {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(() => checkStaleness(), 30_000);
  };

  const stopStalenessCheck = (): void => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = undefined;
    }
  };

  return {
    getLatestCursor,
    updateCursor,
    checkStaleness,
    startStalenessCheck,
    stopStalenessCheck,
    recordBlockReceived,
  };
};
