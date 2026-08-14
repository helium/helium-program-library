import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="border-background relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden md:border-x-[40px]">
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden md:rounded-3xl"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 right-0 h-[50vh] w-[60vw] rounded-lg"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgb(72 78 253) 0%, rgb(15 206 134) 40%, rgb(161 52 248) 100%)",
            filter: "blur(80px)",
            opacity: 0.85,
          }}
        />
        <div
          className="absolute bottom-0 left-0 h-[40vh] w-[50vw] rounded-lg"
          style={{
            background:
              "radial-gradient(circle at bottom left, rgb(15 206 134) 0%, rgb(161 52 248) 40%, rgb(72 78 253) 80%)",
            filter: "blur(60px)",
            opacity: 0.5,
          }}
        />
      </div>

      <div className="container relative mx-auto flex flex-col items-center gap-6 px-4 py-12 text-center">
        <h1 className="text-3xl font-medium tracking-tight text-white md:text-6xl">
          Power Up Helium
          <br />
          Deploy, Host, and Earn
        </h1>
        <p className="text-lg text-white/80 md:max-w-2xl md:text-2xl">
          Seamlessly deploy and host hotspots, monitor your network, and
          maximize your earnings with My Helium.
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/how-it-works"
            rel="noreferrer noopener"
            className="flex-1"
          >
            <Button
              size="lg"
              className="w-full px-8 py-4 text-lg hover:cursor-pointer"
            >
              How It Works
            </Button>
          </Link>
          <div className="flex-1">
            <ConnectWalletButton
              size="lg"
              variant="outline"
              className="w-full border-none px-8 py-4 text-lg"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
