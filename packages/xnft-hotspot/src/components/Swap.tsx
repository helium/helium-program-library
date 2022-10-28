import { useCallback, useEffect, useState } from "react";
import {
  useNavigation,
  View,
  Image,
  Text,
  Button,
  TextField,
  usePublicKey,
  useConnection,
} from "react-xnft";
import { THEME } from "../utils/theme";
import { PublicKey, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import { getMint, AccountLayout, getAssociatedTokenAddress } from "@solana/spl-token";
import * as dc from "@helium-foundation/data-credits-sdk";
import * as tm from "@helium-foundation/treasury-management-sdk";
import { DC_MINT, MOBILE_MINT, toBN } from "@helium-foundation/spl-utils";
import * as anchor from "@project-serum/anchor";

type Token = {
  name: string;
  // mint only required for treasury swaps
  mint?: PublicKey;
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
      icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png'
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
    },
    {
      name: 'HNT',
      icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png'
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
        const p = await getTreasuryPrice(connection, publicKey, topSelected.mint!);
        const updated = {
          ...priceCache
        }
        updated[symbol] = {
          lastCheckedTime: new Date().getTime() / 1000,
          price: p
        }
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
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '-25px',
        marginBottom: '50px',
      }}>
        <TokenSelector tokens={topTokens} selected={topSelected} setSelected={setTopSelectedWrapper}/>
        <TextField placeholder="Amount" 
          style={{
            marginLeft: '20px',
            width: '30%',
          }}
          onChange={(e) => parseAndSetTop(e.target.value)}
        />
      </View>
      <Image 
        style={{
          borderRadius: "6px",
          width: "50px",
          height: "50px",
          opacity: swapAllowed ? '1' : '0.5',
        }}
        src="https://shdw-drive.genesysgo.net/CYPATLeMUuCkqBuREw1gYdfckZitf2rjMH4EqfTCMPJJ/transparent-down-arrow.png"
      />
      <View style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '50px',
        marginBottom: '30px',
        width: '100%',
      }}>
        <TokenSelector tokens={bottomTokens} selected={bottomSelected} setSelected={setBottomSelected}/>
        
        <View style={{
          marginLeft: '20px',
          borderRadius: '12px',
          background: '#fff',
          width: '30%',
          opacity: '0.65',
        }}>
          <Text style={{
            padding: '16.5px 14px',
            color: '#4E5768',
            textAlign: 'left',
          }}>{ bottomAmount }</Text>
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

function TokenSelector({ tokens, selected, setSelected }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <View>
      <View onClick={() => setIsOpen(!isOpen) } style={{
        color: '#fff',
        cursor: 'pointer',
      }}>
        <TokenDisplay token={selected} />
        
      </View>
      {isOpen && (
          <View style={{
            borderRadius: '10px',
            position: 'absolute',
            marginTop: '20px',
            backgroundColor: '#19243b',
            cursor: 'pointer',
            zIndex: '10',
          }}>
            {tokens.map((token: Token) => {
              return (
                <View onClick={() => {setSelected(token); setIsOpen(!isOpen)}} style={{
                  cursor: 'pointer',
                  padding: '10px',
                }}>
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