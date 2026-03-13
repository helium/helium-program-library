import { ReactNode } from "react";

interface WorkspaceProps {
  children: ReactNode;
  className?: string;
}

export const Workspace = ({ children, className = "" }: WorkspaceProps) => {
  return (
    <div className="flex-1 w-full">
      <div className={`container mx-auto px-4 py-4 ${className}`}>
        {children}
      </div>
    </div>
  );
};
