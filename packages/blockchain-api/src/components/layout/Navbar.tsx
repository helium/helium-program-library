"use client";

import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconHeliumLogo } from "@/components/ui/icons/logo";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ROUTE_HOW_IT_WORKS,
  ROUTE_SUPPORT,
  dashboard,
} from "@/lib/utils/routes";
import { truncateAddress } from "@/lib/utils/misc";
import {
  usePrivy,
  useSolanaWallets,
  useConnectWallet,
} from "@privy-io/react-auth";
import { useViewAs } from "@/providers/ViewAsProvider";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Jazzicon from "react-jazzicon";

interface RouteProps {
  href: string;
  label: string;
}

const routeList: RouteProps[] = [
  {
    href: ROUTE_SUPPORT,
    label: "Support",
  },
  {
    href: ROUTE_HOW_IT_WORKS,
    label: "How It Works",
  },
];

const getJazziconSeed = (address: string) => {
  return parseInt(address.slice(2, 10), 16);
};

interface UserMenuProps {
  address: string;
  onLogout: () => void;
  className?: string;
}

const UserMenu = ({ address, onLogout, className = "" }: UserMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" className={`gap-2 ${className}`}>
        <Jazzicon diameter={24} seed={getJazziconSeed(address)} />
        <span>{truncateAddress(address, 5, 5)}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
      <DropdownMenuItem onClick={onLogout}>Logout</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const Navbar = ({ showNav = true }: { showNav?: boolean }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { user, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { connectWallet } = useConnectWallet();
  const pathname = usePathname();
  const isDev = process.env.NODE_ENV === "development";
  const { viewAsAddress } = useViewAs();

  // Prefer external (adapter) wallet over embedded for display
  const externalWallet = wallets.find((w) => w.walletClientType !== "privy");
  const realAddress = externalWallet?.address || user?.wallet?.address;
  const displayAddress = viewAsAddress || realAddress;

  // Preserve viewAs param in dashboard links
  const dashboardHref = displayAddress
    ? viewAsAddress
      ? `${dashboard(displayAddress)}?viewAs=${viewAsAddress}`
      : dashboard(displayAddress)
    : "/";

  return (
    <>
      {viewAsAddress && (
        <div className="bg-yellow-500 text-black text-center text-sm py-1 px-4 font-medium">
          Viewing as: {truncateAddress(viewAsAddress, 8, 8)}
          {" — "}
          <a
            href={pathname}
            className="underline font-semibold"
          >
            Exit
          </a>
        </div>
      )}
      <header
      className={`sticky top-0 z-40 w-full py-[2px] bg-white dark:bg-background ${
        pathname !== "/" ? "border-b border-gray-200 dark:border-gray-800" : ""
      }`}
    >
      <NavigationMenu className="mx-auto">
        <NavigationMenuList className="container h-14 px-4 w-screen flex justify-between ">
          <div className="flex-1 items-center">
            <NavigationMenuItem className="font-bold flex">
              <Link
                rel="noreferrer noopener"
                href={dashboardHref}
                className="font-bold text-xl flex items-center gap-2"
              >
                <IconHeliumLogo className="w-9 h-9" />
                my
              </Link>
            </NavigationMenuItem>
          </div>

          <div
            className="hidden md:flex flex-1 justify-center items-center gap-2 px-4 py-1"
            hidden={!showNav}
          >
            <div className="md:flex justify-center items-center gap-2 bg-slate-100 dark:bg-accent rounded-full px-4">
              <nav className="flex gap-4 px-2">
                {routeList.map(({ href, label }, i) => (
                  <Link href={href} rel="noreferrer noopener" key={i}>
                    <Button
                      variant="link"
                      size="sm"
                      className="hover:cursor-pointer p-0"
                    >
                      {label}
                    </Button>
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="hidden md:flex flex-1 justify-end items-center gap-2">
            {isDev && displayAddress && (
              <Button variant="outline" size="sm" onClick={connectWallet}>
                + Wallet
              </Button>
            )}
            {displayAddress ? (
              <UserMenu address={displayAddress} onLogout={logout} />
            ) : (
              <ConnectWalletButton size="sm" />
            )}
          </div>

          {/* mobile */}
          <span className="flex md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger className="px-2" asChild>
                <button type="button" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu Icon</span>
                </button>
              </SheetTrigger>

              <SheetContent side={"left"} className="flex flex-col h-full">
                <SheetHeader>
                  <SheetTitle className="font-bold text-xl flex items-center gap-2">
                    <IconHeliumLogo className="w-8 h-8" /> my
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col w-full gap-2 mt-4 px-4">
                  {routeList.map(({ href, label }, i) => (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      key={i}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:cursor-pointer w-full"
                      >
                        {label}
                      </Button>
                    </Link>
                  ))}
                </nav>
                <div className="flex flex-grow" />
                <div className="w-full flex flex-col gap-2 px-8 pb-8">
                  {displayAddress ? (
                    <UserMenu address={displayAddress} onLogout={logout} />
                  ) : (
                    <ConnectWalletButton
                      variant="default"
                      size="sm"
                      className="hover:cursor-pointer w-full"
                    />
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </span>
        </NavigationMenuList>
      </NavigationMenu>
    </header>
    </>
  );
};
