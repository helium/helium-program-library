import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WelcomePackWithHotspot } from "@/lib/queries/welcome-packs";
import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { useSignMessage } from "@privy-io/react-auth/solana";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { client } from "@/lib/orpc";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  pack: WelcomePackWithHotspot;
}

export default function InviteModal({
  isOpen,
  onClose,
  pack,
}: InviteModalProps) {
  const [expirationDays, setExpirationDays] = useState("7");
  const [inviteUrl, setInviteUrl] = useState<string>();
  const { user, connectWallet } = usePrivy();
  const walletAddress = useWalletAddress();
  const { wallets } = useSolanaWallets();
  const { signMessage: signMessageEmbedded } = useSignMessage();
  const signMessage =
    user?.wallet?.connectorType === "embedded"
      ? (msg: Uint8Array) =>
          signMessageEmbedded({ message: msg }).then((res) => Buffer.from(res))
      : wallets[0] && wallets[0].signMessage;

  const [error, setError] = useState<string>();

  const { execute: generateInvite, loading: isGenerating } = useAsyncCallback(
    async () => {
      if (!walletAddress) throw new Error("Wallet not connected");

      if (!signMessage) {
        connectWallet({
          description: "Connect your wallet to submit transactions",
          // @ts-ignore
          walletList: ["detected_solana_wallets"],
        });
        throw new Error("Wallet not connected");
      }

      const data = await client.welcomePacks.invite({
        packAddress: pack.address,
        walletAddress,
        expirationDays: parseInt(expirationDays),
      });

      const signature = await signMessage(Buffer.from(data.message));

      const url = new URL(`/invites/${pack.address}`, window.location.origin);
      url.searchParams.set("expirationTs", data.expirationTs.toString());
      url.searchParams.set(
        "signature",
        encodeURIComponent(Buffer.from(signature).toString("base64")),
      );

      setInviteUrl(url.toString());
      setError(undefined);
    },
    {
      onError: (e) => {
        console.error("Error generating invite message", e);
        setError(e instanceof Error ? e.message : "Failed to generate invite");
      },
    },
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Invite Link</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expiration-days">Expiration (days)</Label>
            <Input
              id="expiration-days"
              type="number"
              value={expirationDays}
              onChange={(e) => setExpirationDays(e.target.value)}
            />
          </div>

          <Button
            onClick={generateInvite}
            className="w-full"
            disabled={isGenerating}
          >
            Generate QR Code
          </Button>

          {error && <div className="text-sm text-red-600">{error}</div>}

          {inviteUrl && (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <QRCodeSVG value={inviteUrl} size={200} />
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground break-all font-mono">
                  {inviteUrl}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
