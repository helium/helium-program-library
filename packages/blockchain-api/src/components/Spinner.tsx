export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900 dark:border-white ${className}`}
    />
  );
}
