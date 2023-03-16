import {
  Alert,
  AlertIcon, Button, Checkbox, Flex,
  Heading, Icon, Input, Text, VStack
} from "@chakra-ui/react";
import { bulkSendRawTransactions } from "@helium/spl-utils";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import axios from "axios";
import { Step, Steps, useSteps } from "chakra-ui-steps";
import { useMemo, useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { FaCheckCircle } from "react-icons/fa";

const BIP32_HARDENED_BIT = (1 << 31) >>> 0;

function harden(n: number): number {
  return (n | BIP32_HARDENED_BIT) >>> 0;
}

function getHeliumDerivationPath(account: number = 0, change: number = 0): Buffer {
  const length = 5;
  const derivationPath = Buffer.alloc(1 + length * 4);

  let offset = derivationPath.writeUInt8(length, 0);
  offset = derivationPath.writeUInt32BE(harden(44), offset); // Using BIP44
  offset = derivationPath.writeUInt32BE(harden(904), offset); // Helium's BIP44 path

  // if (account !== undefined) {
    offset = derivationPath.writeUInt32BE(harden(account), offset);
    // if (change !== undefined) {
      offset = derivationPath.writeUInt32BE(harden(change), offset);
      derivationPath.writeUInt32BE(harden(0), offset);

    // }
  // }

  return derivationPath;
}

function getSolanaDerivationPath(account?: number, change?: number): Buffer {
  const length = account !== undefined ? (change === undefined ? 3 : 4) : 2;
  const derivationPath = Buffer.alloc(1 + length * 4);

  let offset = derivationPath.writeUInt8(length, 0);
  offset = derivationPath.writeUInt32BE(harden(44), offset); // Using BIP44
  offset = derivationPath.writeUInt32BE(harden(501), offset); // Solana's BIP44 path

  if (account !== undefined) {
    offset = derivationPath.writeUInt32BE(harden(account), offset);
    if (change !== undefined) {
      derivationPath.writeUInt32BE(harden(change), offset);
    }
  }

  return derivationPath;
}


function partitionBy<A>(arr: A[], predicate: (a: A) => boolean): [A[], A[]] {
  // @ts-ignore
  return arr.reduce((acc, item) => (acc[+!predicate(item)].push(item), acc), [[], []])
}

const ATTESTATION = "I attest that both the source and destination wallets are owned and controlled by the same individual or entity, and that I have legal authority to perform this transaction on behalf of that individual or entity."

export const Migration = () => {
   const { nextStep, prevStep, reset, activeStep } = useSteps({
     initialStep: 0,
   });
   const [solanaPubkey, setSolanaPubkey] = useState<PublicKey | null>(null);
   const [heliumPubkey, setHeliumPubkey] = useState<PublicKey | null>(null);
   const [accountNumber, setAccountNumber] = useState<string>("0");
   const heliumWallet = useMemo(
     () =>
       new LedgerWalletAdapter({
         derivationPath: getHeliumDerivationPath(Number(accountNumber)),
       }),
     [accountNumber]
   );
   const solanaWallet = useMemo(
     () =>
       new LedgerWalletAdapter({
         derivationPath: getSolanaDerivationPath(Number(accountNumber) || undefined),
       }),
     [accountNumber]
   );
   const [attested, setAttested] = useState(false);
   const connection = useMemo(() => new Connection(
    process.env.REACT_APP_SOLANA_URL!
   ), []);
   

   const {
     execute,
     error: errorSolana,
     loading: loadingSolana,
   } = useAsyncCallback(async () => {
     await solanaWallet.connect();
     setSolanaPubkey(solanaWallet.publicKey);
     // Disconnect so we can connect the helium ledger
     await solanaWallet.disconnect();
     return solanaWallet;
   });
   const {
     execute: executeHelium,
     error: errorHelium,
     loading: loadingHelium,
   } = useAsyncCallback(async () => {
     await heliumWallet.connect();
     setHeliumPubkey(heliumWallet.publicKey);
     return heliumWallet;
   });
   const {
    result: inflateResult,
    execute: executeInflate,
    error: errorInflate,
    loading: loadingInflate
   } = useAsyncCallback(async (wallet: PublicKey) => {
    async function getTxs() {
      return (await axios.get(`${process.env.REACT_APP_MIGRATION_SERVICE_URL}/migrate/${wallet.toBase58()}`)).data
    }
    const txs = (await getTxs()).transactions;
    const txBuffers = txs.map((tx: any) => Buffer.from(tx));

    await bulkSendRawTransactions(connection, txBuffers);

    const txs2 = (await getTxs()).transactions;
    if (txs2.length !== 0) {
      throw new Error(
        `Failed to migrate ${txs2.length} transactions, try again`
      );
    }

    return true
   })
   const {
     result: heliumSignResult,
     execute: executeHeliumSign,
     error: errorHeliumSign,
     loading: loadingHeliumSign,
   } = useAsyncCallback(async () => {
     async function getTxs() {
       return (
         await axios.post(
           `${process.env.REACT_APP_MIGRATION_SERVICE_URL}/ledger/migrate`,
           {
             from: heliumPubkey!.toBase58(),
             to: solanaPubkey!.toBase58(),
             attestation: ATTESTATION,
           }
         )
       ).data;
     }
     const txs = await getTxs();
     const txBuffers = txs.map((tx: any) => Buffer.from(tx));
     const deserialized = txBuffers.map((tx: Buffer) => Transaction.from(tx));
     const signed = await heliumWallet!.signAllTransactions(deserialized);
     // Disconnect so we can connect the helium ledger
     await heliumWallet.disconnect();

     return signed;
   });
   const {
     result: solanaSignResult,
     execute: executeSolanaSign,
     error: errorSolanaSign,
     loading: loadingSolanaSign,
   } = useAsyncCallback(async () => {
     const [needSign, dontNeedSign] = partitionBy(heliumSignResult!, tx => tx.signatures.length > 1)
     await solanaWallet.connect()
     const signed = await solanaWallet!.signAllTransactions(needSign);
     

     return [...dontNeedSign, ...signed];
   });

   const {
     result: resultSendTransactions,
     execute: executeSendTransactions,
     error: errorSendTransactions,
     loading: loadingSendTransactions,
   } = useAsyncCallback(async () => {
      const txs = solanaSignResult!.map((tx) => Buffer.from(tx.serialize()));
      await bulkSendRawTransactions(connection, txs)
      return true
   });


   const nextEnabled = useMemo(
     () =>
       activeStep === 0
         ? solanaPubkey
         : activeStep === 1
         ? heliumWallet.connected
         : activeStep === 2
         ? inflateResult
         : activeStep === 3
         ? !!heliumSignResult 
         : activeStep === 4
         ? !!solanaSignResult
         : true,
     [activeStep, heliumSignResult, heliumWallet.connected, inflateResult, solanaPubkey, solanaSignResult]
   );
   const steps = useMemo(
     () => [
       {
         label: "Connect Solana Ledger",
         component: (
           <VStack spacing={8}>
             {errorSolana && (
               <Alert status="error">
                 <AlertIcon />
                 <p>
                   {errorSolana.message}. Please make sure you are connected to
                   the correct ledger app.
                 </p>
               </Alert>
             )}
             <Text>
               Open the Solana App on your ledger. Be sure to enable blind
               signing in the Ledger Settings. Select the account number you
               would like to migrate. Then click the button below.
             </Text>
             <div style={{ fontWeight: 900, marginBottom: "-18px" }}>
               Account Number
             </div>
             <Input
               type="number"
               placeholder="0"
               w="100px"
               onChange={(e) => {
                 setAccountNumber(e.target.value);
               }}
               step="1"
             />
             <Button
               colorScheme="teal"
               isLoading={loadingSolana}
               onClick={async () => {
                 await execute();
               }}
               leftIcon={solanaPubkey ? <Icon as={FaCheckCircle} /> : undefined}
             >
               {solanaPubkey
                 ? solanaPubkey.toBase58()
                 : "Connect Ledger (Solana App)"}
             </Button>
           </VStack>
         ),
       },
       {
         label: "Connect Helium-Solana Ledger",
         component: (
           <VStack spacing={8}>
             {errorHelium && (
               <Alert status="error">
                 <AlertIcon />
                 <p>
                   {errorHelium.message}. Please make sure you are connected to
                   the correct ledger app.
                 </p>
               </Alert>
             )}
             <Text>
               Open the Helium-Solana App on your ledger. Be sure to enable
               blind signing in the Ledger Settings. Then click the button
               below.
             </Text>
             <Button
               colorScheme="teal"
               isLoading={loadingHelium}
               onClick={executeHelium}
               leftIcon={heliumPubkey ? <Icon as={FaCheckCircle} /> : undefined}
             >
               {heliumPubkey
                 ? heliumPubkey.toBase58()
                 : "Connect Ledger (Helium Solana App)"}
             </Button>
           </VStack>
         ),
       },
       {
         label: "Inflate Wallet on Solana",
         component: (
           <VStack spacing={8}>
             {errorInflate && (
               <Alert status="error">
                 <AlertIcon />
                 {errorInflate.message}
               </Alert>
             )}
             Inflate the your tokens and hotspots onto Solana
             <Button
               colorScheme="teal"
               isLoading={loadingInflate}
               isDisabled={inflateResult}
               onClick={() => executeInflate(heliumPubkey!)}
               leftIcon={
                 inflateResult ? <Icon as={FaCheckCircle} /> : undefined
               }
             >
               Inflate Wallet
             </Button>
           </VStack>
         ),
       },
       {
         label: "Sign Transactions with Helium",
         component: (
           <VStack spacing={8}>
             {errorHeliumSign && (
               <Alert status="error">
                 <AlertIcon />
                 {errorHeliumSign.message}
               </Alert>
             )}
             Sign transactions to migrate from the Helium derivation path to the
             Solana derivation path.
             <Button
               colorScheme="teal"
               isLoading={loadingHeliumSign}
               onClick={executeHeliumSign}
               leftIcon={
                 heliumSignResult ? <Icon as={FaCheckCircle} /> : undefined
               }
             >
               Sign Transactions
             </Button>
           </VStack>
         ),
       },
       {
         label: "Sign Transactions with Solana",
         component: (
           <VStack spacing={8}>
             {errorSolanaSign && (
               <Alert status="error">
                 <AlertIcon />
                 {errorSolanaSign.message}
               </Alert>
             )}
             Open the Solana Ledger app. Sign transactions to migrate from the
             Helium derivation path to the Solana derivation path.
             <Button
               colorScheme="teal"
               isLoading={loadingSolanaSign}
               onClick={executeSolanaSign}
               leftIcon={
                 solanaSignResult ? <Icon as={FaCheckCircle} /> : undefined
               }
             >
               Connect and Sign Transactions
             </Button>
           </VStack>
         ),
       },
       {
         label: "Send Migration Transactions",
         component: (
           <VStack spacing={8}>
             {errorSendTransactions && (
               <Alert status="error">
                 <AlertIcon />
                 {errorSendTransactions.message}
               </Alert>
             )}
             <Checkbox
               onChange={() => setAttested(!attested)}
               isChecked={attested}
             >
               {ATTESTATION}
             </Checkbox>

             <Button
               colorScheme="teal"
               isDisabled={!attested}
               isLoading={loadingSendTransactions}
               onClick={executeSendTransactions}
               leftIcon={
                 resultSendTransactions ? (
                   <Icon as={FaCheckCircle} />
                 ) : undefined
               }
             >
               Send Transactions
             </Button>
           </VStack>
         ),
       },
     ],
     [
       attested,
       errorHelium,
       errorHeliumSign,
       errorInflate,
       errorSendTransactions,
       errorSolana,
       errorSolanaSign,
       execute,
       executeHelium,
       executeHeliumSign,
       executeInflate,
       executeSendTransactions,
       executeSolanaSign,
       heliumPubkey,
       heliumSignResult,
       inflateResult,
       loadingHelium,
       loadingHeliumSign,
       loadingInflate,
       loadingSendTransactions,
       loadingSolana,
       loadingSolanaSign,
       resultSendTransactions,
       solanaPubkey,
       solanaSignResult,
     ]
   );

   return (
     <VStack w="full">
       <Steps orientation="vertical" activeStep={activeStep}>
         {steps.map(({ label, component }, index) => (
           <Step width="100%" label={label} key={label}>
             { component }
           </Step>
         ))}
       </Steps>
       {activeStep === steps.length ? (
         <Flex px={4} py={4} width="100%" flexDirection="column">
           <Heading fontSize="xl" textAlign="center">
             Ledger successfully migrated!
           </Heading>
           <Button mx="auto" mt={6} size="sm" onClick={reset}>
             Reset
           </Button>
         </Flex>
       ) : (
         <Flex width="100%" justify="flex-end">
           <Button
             isDisabled={activeStep === 0}
             mr={4}
             onClick={prevStep}
             size="sm"
             variant="ghost"
           >
             Prev
           </Button>
           <Button colorScheme="green" size="sm" onClick={nextStep} isDisabled={!nextEnabled}>
             {activeStep === steps.length - 1 ? "Finish" : "Next"}
           </Button>
         </Flex>
       )}
     </VStack>
   );
}