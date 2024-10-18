import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { useSubDao } from "./useSubDao";
import { useDao } from "./useDao";

export function useRegistrarForMint(mint: PublicKey | undefined) {
  const daoK = useMemo(() => {
    if (mint) {
      return daoKey(mint)[0];
    }
  }, [mint?.toBase58()]);
  const subDaoK = useMemo(() => {
    if (mint) {
      return subDaoKey(mint)[0];
    }
  }, [mint?.toBase58()]);
  const { info: subDao, loading: loadingSubdao } = useSubDao(subDaoK);
  const { info: dao, loading: loadingDao } = useDao(daoK);

  const registrarKey = useMemo(
    () => (subDao && subDao.registrar) || (dao && dao.registrar),
    [subDao?.registrar, dao?.registrar]
  );

  return {
    registrarKey,
    subDao,
    dao,
    loading: loadingDao || loadingSubdao
  }
}