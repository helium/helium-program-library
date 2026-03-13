import React from "react";

export default function Footer() {
  return (
    <footer className="container mx-auto flex justify-center w-full">
      <div className="flex flex-1 flex-col w-full">
        <div className="flex flex-col gap-6 px-5 py-6 text-center w-full">
          <div className="flex flex-wrap items-center justify-center gap-6 w-full sm:flex-row sm:justify-around">
            <a className="text-sm font-normal leading-normal min-w-40" href="#">
              Terms of Service
            </a>
            <a className="text-sm font-normal leading-normal min-w-40" href="#">
              Privacy Policy
            </a>
            <a className="text-sm font-normal leading-normal min-w-40" href="#">
              Contact Us
            </a>
          </div>
          <p className="text-xs text-muted-foreground font-normal leading-normal">
            ©2025 Helium. All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}
