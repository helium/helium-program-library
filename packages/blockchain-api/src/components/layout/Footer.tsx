import React from "react";

export default function Footer() {
  return (
    <footer className="container mx-auto flex w-full justify-center">
      <div className="flex w-full flex-1 flex-col">
        <div className="flex w-full flex-col gap-6 px-5 py-6 text-center">
          <div className="flex w-full flex-wrap items-center justify-center gap-6 sm:flex-row sm:justify-around">
            <a className="min-w-40 text-sm font-normal leading-normal" href="#">
              Terms of Service
            </a>
            <a className="min-w-40 text-sm font-normal leading-normal" href="#">
              Privacy Policy
            </a>
            <a className="min-w-40 text-sm font-normal leading-normal" href="#">
              Contact Us
            </a>
          </div>
          <p className="text-muted-foreground text-xs font-normal leading-normal">
            ©2025 Helium. All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}
