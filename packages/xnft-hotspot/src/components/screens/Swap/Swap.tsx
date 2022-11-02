import React, { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Image,
  Text,
  Button,
  TextField,
  Svg,
  Path,
  Loading,
  usePublicKey,
  useConnection,
} from "react-xnft";
import { PublicKey, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import {
  getMint,
  AccountLayout,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import * as dc from "@helium/data-credits-sdk";
import * as tm from "@helium/treasury-management-sdk";
import {
  DC_MINT,
  MOBILE_MINT,
  HNT_MINT,
  toBN,
  toNumber,
  humanReadableBigint,
  amountAsNum,
} from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import classnames from "classnames";
import { THEME } from "../../../utils/theme";
import { useTitleColor } from "../../../utils/hooks";
import { useTreasuryManagement } from "../../../hooks/useTreasuryManagement";
import { useNotification } from "../../../contexts/notification";
import { useMint, useOwnedAmount } from "@helium/helium-react-hooks";

type Token = {
  name: string;
  mint: PublicKey;
  toTokens?: string[];
  icon: string;
};

type PriceCache = {
  price: number;
  lastCheckedTime: number;
};

// seconds
const CACHE_INVALIDATION_TIME = 30;

async function mintDataCredits(
  connection: Connection,
  wallet: PublicKey,
  amount: number
) {
  const stubProvider = new anchor.AnchorProvider(
    connection,
    //@ts-ignore
    { publicKey: wallet },
    anchor.AnchorProvider.defaultOptions()
  );
  const program = await dc.init(stubProvider);

  const tx = await program.methods
    .mintDataCreditsV0({
      amount: new anchor.BN(amount),
    })
    .accounts({ dcMint: DC_MINT })
    .transaction();
  const { blockhash } = await connection.getLatestBlockhash("recent");
  tx.recentBlockhash = blockhash;

  //@ts-ignore
  await window.xnft.solana.sendAndConfirm(tx);
}

async function treasurySwap(
  connection: Connection,
  wallet: PublicKey,
  amount: number,
  fromMint: PublicKey
) {
  const stubProvider = new anchor.AnchorProvider(
    connection,
    //@ts-ignore
    { publicKey: wallet },
    anchor.AnchorProvider.defaultOptions()
  );
  const program = await tm.init(stubProvider);
  const fromMintAcc = await getMint(connection, fromMint);

  const treasuryManagement = tm.treasuryManagementKey(fromMint)[0];
  const tx = await program.methods
    .redeemV0({
      amount: toBN(amount, fromMintAcc.decimals),
      expectedOutputAmount: new anchor.BN(0),
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
    ])
    .accounts({
      treasuryManagement,
    })
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash("recent");
  tx.recentBlockhash = blockhash;

  //@ts-ignore
  await window.xnft.solana.sendAndConfirm(tx, [], { skipPreflight: true });
}

function round(value, decimals) {
  //@ts-ignore
  return Number(Math.round(value + "e" + decimals) + "e-" + decimals);
}

export function useTreasuryPrice(
  fromMint: PublicKey,
  amount: number
): { loading: boolean; price: number | undefined } {
  const treasuryManagementKey = useMemo(
    () => tm.treasuryManagementKey(fromMint)[0],
    [fromMint.toBase58()]
  );
  const { info: treasuryAcc, loading: loadingTreasuryManagement } = useTreasuryManagement(treasuryManagementKey);
  const { info: fromMintAcc, loading: loadingFromMint } = useMint(fromMint);
  const { info: treasuryMintAcc, loading: loadingTreasuryMint } = useMint(treasuryAcc?.treasuryMint);
  const { amount: r, decimals: rDecimals, loading: loadingR } = useOwnedAmount(treasuryManagementKey, treasuryAcc?.treasuryMint)

  const price = useMemo(() => {
    if (
      fromMintAcc &&
      treasuryMintAcc &&
      treasuryAcc &&
      typeof r !== "undefined"
    ) {
      // only works for basic exponential curves
      // dR = (R / S^(1 + k)) ((S + dS)^(1 + k) - S^(1 + k))
      const S = Number(
        fromMintAcc.info.supply /
          BigInt(Math.pow(10, fromMintAcc.info.decimals))
      );
      const R = amountAsNum(r, rDecimals);
      const k =
        //@ts-ignore
        treasuryAcc.curve.exponentialCurveV0.k.toNumber() / Math.pow(10, 12);
      console.log("tm3", S, R, k);
      const dR =
        (R / Math.pow(S, k + 1)) *
        (Math.pow(S - amount, k + 1) - Math.pow(S, k + 1));
      return Math.abs(dR);
    }
  }, [
    r,
    fromMintAcc?.info.supply,
    fromMintAcc?.info.decimals,
    treasuryMintAcc?.info.supply,
    treasuryMintAcc?.info.decimals,
    treasuryAcc?.curve,
    amount
  ]);

  const loading = loadingTreasuryManagement || loadingFromMint || loadingTreasuryMint || loadingR
  return { price, loading }
}

export function Swap() {
  useTitleColor();
  const publicKey = usePublicKey();
  const connection = useConnection();
  const dcRate = 1; //TODO this needs to be fetched from an oracle
  const topTokens: Token[] = [
    {
      name: "HNT",
      toTokens: ["DC"],
      icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png",
      mint: HNT_MINT,
    },
    {
      name: "MOBILE",
      toTokens: ["HNT"],
      icon: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/mobile.png",
      mint: MOBILE_MINT,
    },
  ];
  const bottomTokens: Token[] = [
    {
      name: "DC",
      icon: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.png",
      mint: DC_MINT,
    },
    {
      name: "HNT",
      icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png",
      mint: HNT_MINT,
    },
  ];

  const [topSelected, setTopSelected] = useState<Token>(topTokens[0]);
  const [bottomSelected, setBottomSelected] = useState<Token>(bottomTokens[0]);

  const [swapAllowed, setSwapAllowed] = useState<boolean>(true);

  const [topAmount, setTopAmount] = useState<number>(0);
  const [rawTopAmount, setRawTopAmount] = useState<string>("");
  const { price: price, loading: loadingPrice } = useTreasuryPrice(topSelected.mint, topAmount);
  const [isDcMint, setIsDcMint] = useState<boolean>(true);
  const bottomAmount = useMemo(() => isDcMint ? topAmount * Math.pow(10, 8) : price, [price, isDcMint, topAmount])

  const [txLoading, setLoading] = useState<boolean>(false);
  const { setMessage } = useNotification();

  const parseAndSetTop = useCallback((newTop: number | string | undefined) => {
    let parsed: any = newTop!;
    if (typeof newTop === "string") {
      setRawTopAmount(newTop);
      parsed = parseFloat(newTop);
    }
    setTopAmount(parsed);
  }, []);

  const setTopSelectedWrapper = useCallback((newTop: Token) => {
    if (newTop.toTokens?.length == 1) {
      const bottom = bottomTokens.find((x) => x.name === newTop.toTokens![0])!;
      setBottomSelected(bottom);
    }
    setTopSelected(newTop);
  }, []);

  // update when token selected
  useEffect(() => {
    if (topSelected.toTokens?.includes(bottomSelected.name)) {
      setSwapAllowed(true);
    } else {
      setSwapAllowed(false);
    }
  }, [topSelected, bottomSelected]);

  // update isDcMint
  useEffect(() => {
    setIsDcMint(topSelected.name === "HNT" && bottomSelected.name === "DC");
  }, [topSelected, bottomSelected]);

  const { amount: balance, decimals: balanceDecimals, loading: loadingBalance } = useOwnedAmount(publicKey, topSelected.mint);

  const executeSwap = useCallback(() => {
    if (txLoading) return;
    async function swap() {
      setLoading(true);
      console.log("swapping");
      try {
        if (isDcMint) {
          await mintDataCredits(connection, publicKey, topAmount * Math.pow(10, 8));
        } else {
          await treasurySwap(
            connection,
            publicKey,
            topAmount,
            topSelected.mint!
          );
        }
        setLoading(false);
        setMessage("Transaction confirmed", "success");
      } catch (err) {
        setLoading(false);
        setMessage(`Transaction failed: ${err.message}`, "error");
      }
    }
    swap();
  }, [isDcMint, topAmount, connection, publicKey, txLoading]);

  return (
    <View tw="relative h-full text-center pt-5">
      <View tw="w-full px-5 mb-10">
        <View tw="flex w-full mb-1 justify-between items-baseline">
          <Text tw="text-zinc-900 dark:text-zinc-400">Burning</Text>
          <View
            tw="flex justify-baseline"
            onClick={() =>
              parseAndSetTop(
                `${humanReadableBigint(
                  balance,
                  balanceDecimals,
                  balanceDecimals
                )}`
              )
            }
          >
            <Text tw="text-xs text-zinc-900 dark:text-zinc-400 cursor-pointer">
              Max:&nbsp;
            </Text>
            <Text tw="text-xs font-bold text-zinc-800 dark:text-zinc-300 cursor-pointer">
              {loadingBalance ? "..." : humanReadableBigint(balance, balanceDecimals, 4)}
            </Text>
          </View>
        </View>
        <View tw="flex flex-row relative justify-center items-center mb-12 w-full">
          <TextField
            tw="block p-3 w-full text-lg text-gray-900 bg-gray-200 rounded-lg hover:border-blue-500 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-900/[.8] dark:border-zinc-800 dark:placeholder-zinc-400 dark:text-white"
            placeholder="Amount"
            value={rawTopAmount}
            onChange={(e) => parseAndSetTop(e.target.value)}
          />
          <TokenSelector
            tw="flex text-white absolute right-0 top-25 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-r-lg text-sm px-4 py-2 dark:hover:bg-zinc-900 dark:focus:ring-blue-800"
            tokens={topTokens}
            selected={topSelected}
            setSelected={setTopSelectedWrapper}
          />
        </View>
      </View>

      <View tw="border-b-2 block w-full h-2 border-zinc-900 dark:border-zinc-900/[.5]"></View>

      <View tw="w-full mt-10 px-5">
        <View tw="flex w-full mb-1 justify-between items-baseline">
          <Text tw="text-zinc-900 dark:text-zinc-400">Receiving</Text>
        </View>
        <View tw="flex justify-between p-3 relative items-center w-full rounded-lg bg-gray-200/[.4] dark:bg-zinc-900/[.4] ">
          <Text tw="text-lg text-gray-900 dark:text-white">{bottomAmount || "0"}</Text>
          <TokenSelector
            tw="flex text-white absolute right-0 top-25 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-r-lg text-sm px-4 py-2 dark:hover:bg-zinc-900 dark:focus:ring-blue-800"
            tokens={bottomTokens}
            selected={bottomSelected}
            setSelected={setBottomSelected}
          />
        </View>
      </View>
      <View tw="flex flex-col w-full p-5 absolute bottom-0">
        <Text tw="text-xs mb-2">
          Note: Trades completed using this tool are only one way.
        </Text>
        <Button
          tw={classnames(
            "h-12 w-full border-0 rounded-md flex justify-center items-center",
            [
              ,
              ...[
                swapAllowed &&
                  !txLoading && ["bg-green-600", "hover:bg-green-700"],
              ],
              ...[
                !(swapAllowed && !txLoading && !loadingPrice) &&
                  "bg-green-600/[0.5]",
              ],
            ]
          )}
          onClick={executeSwap}
        >
          <Text tw="text-white font-bold text-md">
            {swapAllowed ? "Burn" : "Invalid burn"}
          </Text>
          {txLoading && <Loading style={{ marginLeft: "5px" }} />}
        </Button>
      </View>
    </View>
  );
}

function TokenSelector({ tokens, selected, setSelected, tw }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <View tw={tw}>
      <View
        onClick={() => setIsOpen(!isOpen)}
        style={{
          color: "#fff",
          cursor: "pointer",
          display: "flex",
        }}
      >
        <TokenDisplay token={selected} />
        <Svg
          tw="black w-4 h-4 ml-2 mb-2 self-center"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
        >
          <Path d="M19 9l-7 7-7-7" />
        </Svg>
      </View>
      {isOpen && (
        <View
          style={{
            borderRadius: "4px",
            position: "absolute",
            marginTop: "40px",
            cursor: "pointer",
            zIndex: "10",
            webkitBoxShadow: "0 3px 7px rgba(0, 0, 0, 0.3)",
            boxShadow: "0 3px 7px rgba(0, 0, 0, 0.3)",
          }}
          tw="bg-gray-100 dark:bg-zinc-900"
        >
          {tokens.map((token: Token) => {
            return (
              <View
                onClick={() => {
                  setSelected(token);
                  setIsOpen(!isOpen);
                }}
                style={{
                  cursor: "pointer",
                  padding: "10px",
                }}
                tw="hover:bg-gray-200 dark:hover:bg-zinc-800"
              >
                <TokenDisplay token={token} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TokenDisplay({ token }) {
  return (
    <View
      style={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <Image
        style={{
          borderRadius: "6px",
          width: "35px",
          height: "35px",
        }}
        src={token.icon}
      />
      <Text
        style={{
          display: "inline",
          paddingLeft: "5px",
        }}
      >
        {token.name}
      </Text>
    </View>
  );
}
