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
        <div className="bg-yellow-500 px-4 py-1 text-center text-sm font-medium text-black">
          Viewing as: {truncateAddress(viewAsAddress, 8, 8)}
          {" — "}
          <a href={pathname} className="font-semibold underline">
            Exit
          </a>
        </div>
      )}
      <header
        className={`dark:bg-background sticky top-0 z-40 w-full bg-white py-[2px] ${
          pathname !== "/"
            ? "border-b border-gray-200 dark:border-gray-800"
            : ""
        }`}
      >
        <NavigationMenu className="mx-auto">
          <NavigationMenuList className="container flex h-14 w-screen justify-between px-4 ">
            <div className="flex-1 items-center">
              <NavigationMenuItem className="flex font-bold">
                <Link
                  rel="noreferrer noopener"
                  href={dashboardHref}
                  className="flex items-center gap-2 text-xl font-bold"
                >
                  <IconHeliumLogo className="h-9 w-9" />
                  my
                </Link>
              </NavigationMenuItem>
            </div>

            <div
              className="hidden flex-1 items-center justify-center gap-2 px-4 py-1 md:flex"
              hidden={!showNav}
            >
              <div className="dark:bg-accent items-center justify-center gap-2 rounded-full bg-slate-100 px-4 md:flex">
                <nav className="flex gap-4 px-2">
                  {routeList.map(({ href, label }, i) => (
                    <Link href={href} rel="noreferrer noopener" key={i}>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 hover:cursor-pointer"
                      >
                        {label}
                      </Button>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
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

                <SheetContent side={"left"} className="flex h-full flex-col">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-xl font-bold">
                      <IconHeliumLogo className="h-8 w-8" /> my
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="mt-4 flex w-full flex-col gap-2 px-4">
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
                          className="w-full hover:cursor-pointer"
                        >
                          {label}
                        </Button>
                      </Link>
                    ))}
                  </nav>
                  <div className="flex flex-grow" />
                  <div className="flex w-full flex-col gap-2 px-8 pb-8">
                    {displayAddress ? (
                      <UserMenu address={displayAddress} onLogout={logout} />
                    ) : (
                      <ConnectWalletButton
                        variant="default"
                        size="sm"
                        className="w-full hover:cursor-pointer"
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
