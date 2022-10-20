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
import { PublicKey, Connection } from "@solana/web3.js";
import { init } from "@helium-foundation/data-credits-sdk";
import * as anchor from "@project-serum/anchor";

type Token = {
  name: string;
  toTokens?: string[];
  icon: string;
}

const dcMint = new PublicKey("9gXkafdgJ9xD4xWrfTnxiY1KnNLYCRNMZgge2c1aKA6d"); // TODO change this to correct mint address

async function mintDataCredits(connection: Connection, publicKey: PublicKey, amount: number) {
  //@ts-ignore
  const stubProvider = new anchor.AnchorProvider(connection, {publicKey}, anchor.AnchorProvider.defaultOptions())
  const program = await init(stubProvider);

  const tx = await program.methods
    .mintDataCreditsV0({
      amount: new anchor.BN(amount * 10 ** 8),
    })
    .accounts({ dcMint })
    .transaction();
  const { blockhash } = await connection!.getLatestBlockhash("recent");
  tx.recentBlockhash = blockhash;

  //@ts-ignore
  await window.xnft.send(tx);
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
      icon: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/mobile.png'
    }
  ];
  const bottomTokens: Token[] = [{
    name: 'DC',
    icon: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.png'
  }];

  const [topSelected, setTopSelected] = useState<Token>(topTokens[0]);
  const [bottomSelected, setBottomSelected] = useState<Token>(bottomTokens[0]);

  const [swapAllowed, setSwapAllowed] = useState<boolean>(true);

  const [topAmount, setTopAmount] = useState<number>(0);
  const [bottomAmount, setBottomAmount] = useState<number>(0);
  const [isDcMint, setIsDcMint] = useState<boolean>(true);
  
  const parseAndSetTop = useCallback((newTop: number | string | undefined) => {
    let parsed: any = newTop!;
    if (typeof newTop === "string") {
      parsed = parseFloat(newTop);
    }
    setTopAmount(parsed);
  }, [])

  useEffect(() => {
    if (isDcMint) {
      setBottomAmount(topAmount * dcRate);
      return;
    } else {
      setBottomAmount(0);
    }
  }, [topAmount, isDcMint, topSelected, bottomSelected]);

  useEffect(() => {
    if (topSelected.toTokens?.includes(bottomSelected.name)) {
      setSwapAllowed(true);
    } else {
      setSwapAllowed(false);
    }
  }, [topSelected, bottomSelected])

  useEffect(() => {
    setIsDcMint(topSelected.name === "HNT" && bottomSelected.name === "DC");
  }, [topSelected, bottomSelected])


  const executeSwap = useCallback(() => {
    console.log("swapping");
    if (isDcMint) {
      // mint DC by burning HNT
      mintDataCredits(connection, publicKey, topAmount)
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
        <TokenSelector tokens={topTokens} selected={topSelected} setSelected={setTopSelected}/>
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
          backgroundColor: THEME.colors.stake,
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