import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="flex flex-1 flex-col justify-center items-center w-full relative overflow-hidden md:border-x-[40px] border-background">
      <div
        className="absolute inset-0 z-0 pointer-events-none md:rounded-3xl overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 right-0 w-[60vw] h-[50vh] rounded-lg"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgb(72 78 253) 0%, rgb(15 206 134) 40%, rgb(161 52 248) 100%)",
            filter: "blur(80px)",
            opacity: 0.85,
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[50vw] h-[40vh] rounded-lg"
          style={{
            background:
              "radial-gradient(circle at bottom left, rgb(15 206 134) 0%, rgb(161 52 248) 40%, rgb(72 78 253) 80%)",
            filter: "blur(60px)",
            opacity: 0.5,
          }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-6 px-4 py-12 text-center container mx-auto">
        <h1 className="text-3xl md:text-6xl font-medium tracking-tight text-white">
          Power Up Helium
          <br />
          Deploy, Host, and Earn
        </h1>
        <p className="text-lg md:max-w-2xl md:text-2xl text-white/80">
          Seamlessly deploy and host hotspots, monitor your network, and
          maximize your earnings with My Helium.
        </p>
        <div className="flex gap-4 mt-4 flex-col sm:flex-row">
          <Link
            href="/how-it-works"
            rel="noreferrer noopener"
            className="flex-1"
          >
            <Button
              size="lg"
              className="px-8 py-4 text-lg hover:cursor-pointer w-full"
            >
              How It Works
            </Button>
          </Link>
          <div className="flex-1">
            <ConnectWalletButton
              size="lg"
              variant="outline"
              className="border-none px-8 py-4 text-lg w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
