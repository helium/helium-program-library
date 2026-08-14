export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-gray-900 dark:border-white ${className}`}
    />
  );
}
