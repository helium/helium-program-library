import { SwapInterface } from "@/components/SwapInterface";

export default function SwapPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 mb-6">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Token Swap
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Trade tokens on Solana using Jupiter&apos;s best routes. Get the
              best prices with minimal slippage.
            </p>
          </div>

          <div className="flex justify-center">
            <SwapInterface />
          </div>

          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-white/50 dark:bg-gray-800/50 px-4 py-2 rounded-full border border-muted/50">
              <span>Powered by</span>
              <a
                href="https://jup.ag"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Jupiter
              </a>
              <span>aggregator</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
