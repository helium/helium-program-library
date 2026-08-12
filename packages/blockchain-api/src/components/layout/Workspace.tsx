import { ReactNode } from "react";

interface WorkspaceProps {
  children: ReactNode;
  className?: string;
}

export const Workspace = ({ children, className = "" }: WorkspaceProps) => {
  return (
    <div className="w-full flex-1">
      <div className={`container mx-auto px-4 py-4 ${className}`}>
        {children}
      </div>
    </div>
  );
};
