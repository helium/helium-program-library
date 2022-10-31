import { useCallback, useEffect, useState } from "react";
import {
  useNavigation,
  View,
  Image,
  Text,
  Button,
  TextField,
  Svg,
  Path,
  usePublicKey,
  useConnection,
} from "react-xnft";
import { THEME } from "../../utils/theme";
import { PublicKey, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import { getMint, AccountLayout, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import * as dc from "@helium/data-credits-sdk";
import * as tm from "@helium/treasury-management-sdk";
import { DC_MINT, MOBILE_MINT, HNT_MINT, toBN, toNumber } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { SwapIcon } from "../../utils/icons";

type Token = {
  name: string;
  mint: PublicKey;
  toTokens?: string[];
  icon: string;
}

type PriceCache = {
  price: number,
  lastCheckedTime: number,
}

// seconds
const CACHE_INVALIDATION_TIME = 30;

async function mintDataCredits(connection: Connection, wallet: PublicKey, amount: number) {
  //@ts-ignore
  const stubProvider = new anchor.AnchorProvider(connection, {publicKey: wallet}, anchor.AnchorProvider.defaultOptions())
  const program = await dc.init(stubProvider);

  const tx = await program.methods
    .mintDataCreditsV0({
      amount: new anchor.BN(amount * 10 ** 8),
    })
    .accounts({ dcMint: DC_MINT })
    .transaction();
  const { blockhash } = await connection.getLatestBlockhash("recent");
  tx.recentBlockhash = blockhash;

  //@ts-ignore
  await window.xnft.solana.send(tx);
}

async function treasurySwap(connection: Connection, wallet: PublicKey, amount: number, fromMint: PublicKey) {
  //@ts-ignore
  const stubProvider = new anchor.AnchorProvider(connection, {publicKey: wallet}, anchor.AnchorProvider.defaultOptions())
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
  await window.xnft.solana.send(tx);
}

function round(value, decimals) {
  //@ts-ignore
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

async function getTreasuryPrice(connection: Connection, wallet: PublicKey, fromMint: PublicKey): Promise<number> {
  //@ts-ignore
  const stubProvider = new anchor.AnchorProvider(connection, {publicKey: wallet}, anchor.AnchorProvider.defaultOptions())
  const program = await tm.init(stubProvider);
  
  const treasuryManagement = tm.treasuryManagementKey(fromMint)[0];
  const treasuryAcc = await program.account.treasuryManagementV0.fetch(treasuryManagement);
  const fromMintAcc = await getMint(connection, fromMint);
  const treasuryMintAcc = await getMint(connection, treasuryAcc.treasuryMint);
  
  // only works for basic exponential curves
  // dR = (R / S^(1 + k)) ((S + dS)^(1 + k) - S^(1 + k))
  const S = Number(fromMintAcc.supply / BigInt(Math.pow(10, fromMintAcc.decimals)));
  const R = Number(AccountLayout.decode(
    (
      await connection.getAccountInfo(treasuryAcc.treasury)
    )?.data!
  ).amount / BigInt(Math.pow(10, treasuryMintAcc.decimals)));
  //@ts-ignore
  const k = (treasuryAcc.curve.exponentialCurveV0.k.toNumber() / Math.pow(10,12));
  console.log("tm3", S, R, k);
  const dR = (R / Math.pow(S,k+1)) * (Math.pow((S - 1),k+1) - Math.pow(S,k+1));
  return Math.abs(dR);
}

export function Swap() {
  const publicKey = usePublicKey();
  const connection = useConnection();
  const dcRate = 1; //TODO this needs to be fetched from an oracle
  const topTokens: Token[] = [
    {
      name: 'HNT',
      toTokens: ['DC'],
      icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png',
      mint: HNT_MINT,
    },
    {
      name: 'MOBILE',
      toTokens: ['HNT'],
      icon: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/mobile.png',
      mint: MOBILE_MINT,
    },
  ];
  const bottomTokens: Token[] = [
    {
      name: 'DC',
      icon: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.png',
      mint: DC_MINT,
    },
    {
      name: 'HNT',
      icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png',
      mint: HNT_MINT,
    }
  ];

  const [topSelected, setTopSelected] = useState<Token>(topTokens[0]);
  const [bottomSelected, setBottomSelected] = useState<Token>(bottomTokens[0]);

  const [swapAllowed, setSwapAllowed] = useState<boolean>(true);

  const [topAmount, setTopAmount] = useState<number>(0);
  const [bottomAmount, setBottomAmount] = useState<number>(0);
  const [isDcMint, setIsDcMint] = useState<boolean>(true);

  // maps trading pair to cached price
  const [priceCache, setPriceCache] = useState<Record<string, PriceCache>>({})
  
  const parseAndSetTop = useCallback((newTop: number | string | undefined) => {
    let parsed: any = newTop!;
    if (typeof newTop === "string") {
      parsed = parseFloat(newTop);
    }
    setTopAmount(parsed);
  }, [])

  const setTopSelectedWrapper = useCallback((newTop: Token) => {
    if (newTop.toTokens?.length == 1) {
      const bottom = bottomTokens.find((x) => x.name === newTop.toTokens![0])!;
      setBottomSelected(bottom);
    }
    setTopSelected(newTop)
  }, [])
  
  // update prices and amounts
  useEffect(() => {
    if (!topSelected || !bottomSelected || !topAmount) return;
    const symbol = `${topSelected.name}/${bottomSelected.name}`;
    if (isDcMint) {
      setBottomAmount(topAmount * dcRate);
    } else {
      async function getTreasuryPricing() {
        if (symbol in priceCache) {
          // check if cache is invalid
          if (priceCache[symbol].lastCheckedTime >= (new Date().getTime()/1000) - CACHE_INVALIDATION_TIME) {
            setBottomAmount(round(priceCache[symbol].price * topAmount, 4));
            return
          }
        }
        console.log("tm1");
        const p = await getTreasuryPrice(connection, publicKey, topSelected.mint!);
        const updated = {
          ...priceCache
        }
        updated[symbol] = {
          lastCheckedTime: new Date().getTime() / 1000,
          price: p
        }
        console.log("tm2", p);
        setPriceCache(updated)
        setBottomAmount(round(p * topAmount, 4));
      }
      getTreasuryPricing();
    }
  }, [topAmount, isDcMint, topSelected, bottomSelected]);

  // update when token selected
  useEffect(() => {
    if (topSelected.toTokens?.includes(bottomSelected.name)) {
      setSwapAllowed(true);
    } else {
      setSwapAllowed(false);
    }
  }, [topSelected, bottomSelected])

  // update isDcMint
  useEffect(() => {
    setIsDcMint(topSelected.name === "HNT" && bottomSelected.name === "DC");
  }, [topSelected, bottomSelected])

  const [balance, setBalance] = useState<number>(0);
  // update max balance
  useEffect(() => {
    async function loadBal() {
      const ata = await getAssociatedTokenAddress(topSelected.mint, publicKey);
      const acc = await getAccount(connection, ata);
      const mint = await getMint(connection, topSelected.mint);
      const bal = toNumber(new anchor.BN(acc.amount.toString()), mint);
      setBalance(bal);
    }
    loadBal();
  }, [topSelected])

  const executeSwap = useCallback(() => {
    console.log("swapping");
    if (isDcMint) {
      mintDataCredits(connection, publicKey, topAmount);
    } else {
      treasurySwap(connection, publicKey, topAmount, topSelected.mint!);
    }
  }, [isDcMint, topAmount, connection, publicKey])

  return (
    <View style={{
      textAlign: 'center',
      display: 'flex',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <View style={{
        width: '85%'
      }}>
        <View style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: '5px',
        }}>
          <Text style={{ color: 'black' }}>Sending</Text>
          <View onClick={() => setTopAmount(balance)}><Text style={{ fontSize: '0.8em', cursor: 'pointer' }} >Max: {balance} {topSelected.name}</Text></View>
        </View>
        <View style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '50px',
          width: '100%',
        }}>
          <TextField
            tw="block p-4 pl-4 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            placeholder="Amount"
            value={isNaN(topAmount) ? '' : topAmount}
            onChange={(e) => parseAndSetTop(e.target.value)}
          />
          <TokenSelector 
            tw="flex text-white absolute right-10 top-25 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" 
            tokens={topTokens} selected={topSelected} setSelected={setTopSelectedWrapper}/>
        </View>
      </View>

      <View style={{
        height: '0px',
        borderBottom: '2px solid #E2E8F0',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '0.1em',
        color: 'white',
        width: '100%',
        textAlign: 'center',
        margin: '35px 0px 20px,',
        
      }}>
        <View style={{
          background: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: '50%',
          position: 'absolute',
          top: '192px',
          left: '30px',

        }}>
          <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40px" tw="p-1.5">
            <Path
              fill="#718096"
              d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z"
            />
          </Svg>
        </View>
      </View>
      
      <View style={{
        width: '85%',
        marginTop: '50px',
      }}>
        <View style={{
          width: '85%',
          marginBottom: '5px',
        }}>
          <Text style={{ color: 'black', textAlign: 'left' }}>Receiving</Text>
        </View>
        <View style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '30px',
          width: '100%',
        }}>
          
          <View style={{
            borderRadius: '12px',
            width: '100%',
            opacity: '0.65',
          }}
            tw="border-solid border border-gray-400 bg-gray-50"
          >
            <Text style={{
              padding: '16.5px 14px',
              color: '#4E5768',
              textAlign: 'left',
            }}>{ bottomAmount }</Text>
          </View>
          <TokenSelector
            tw="flex text-white absolute right-10 top-25 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" 
            tokens={bottomTokens} selected={bottomSelected} setSelected={setBottomSelected}/>
        </View> 
      </View>

      <Button  
        style={{
          height: "48px",
          width: "50%",
          fontSize: "1em",
          backgroundColor: THEME.colors.green[400],
          opacity: swapAllowed ? '1' : '0.5',
          color: '#000',
        }}
        onClick={executeSwap}
      >{swapAllowed ? 'Swap' : 'Invalid swap'}</Button>
      <Text style={{
        fontSize: '0.7em',
        marginTop: '15px',
      }}>Note: Trades completed using this tool are only one way.</Text>

      
    </View>
  );
}

function TokenSelector({ tokens, selected, setSelected, tw }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <View tw={tw}>
      <View onClick={() => setIsOpen(!isOpen) } style={{
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
      }}>
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
          <View style={{
            borderRadius: '4px',
            position: 'absolute',
            marginTop: '40px',
            cursor: 'pointer',
            zIndex: '10',
            webkitBoxShadow: "0 3px 7px rgba(0, 0, 0, 0.3)",
            boxShadow: "0 3px 7px rgba(0, 0, 0, 0.3)",
          }}
            tw="bg-gray-100"
          >
            {tokens.map((token: Token) => {
              return (
                <View onClick={() => {setSelected(token); setIsOpen(!isOpen)}} style={{
                  cursor: 'pointer',
                  padding: '10px',
                }}
                  tw="hover:bg-gray-200"
                >
                  <TokenDisplay token={token} />
                </View>
              )
            })}
          </View>
        )}
    </View>
  )
}

function TokenDisplay({ token }) {
  return (
    <View style={{
      display: 'flex',
      alignItems: 'center'
    }}>
      <Image
        style={{
          borderRadius: "6px",
          width: "35px",
          height: "35px",

        }}
        src={token.icon}
      />
      <Text style={{
        display: 'inline',
        paddingLeft: '5px',
      }}>{token.name}</Text>
    </View>
  )
}