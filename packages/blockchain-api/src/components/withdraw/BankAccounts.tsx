"use client";

import { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { SendFundsModal } from "./SendFundsModal";
import { client, orpc } from "@/lib/orpc";

interface BankAccount {
  id?: number;
  accountName?: string;
  bankName?: string;
  lastFourDigits?: string;
  routingNumber?: string;
  accountType?: string;
}

export function BankAccounts() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(
    null,
  );
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(
    null,
  );

  const {
    data: accounts = [],
    isLoading,
    error,
  } = useQuery({
    ...orpc.fiat.listBankAccounts.queryOptions({
      input: {},
    }),
  });

  const {
    loading: isDeleting,
    error: deleteError,
    execute: deleteBankAccount,
  } = useAsyncCallback(async (id: number) => {
    await client.fiat.deleteBankAccount({ id });
    await queryClient.invalidateQueries({ queryKey: ["bankAccounts"] });
    toast.success("Bank account deleted successfully");
    setAccountToDelete(null);
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load bank accounts"}
        </p>
        <Button onClick={() => router.refresh()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-foreground">Bank Accounts</h2>
        <Button size="sm" onClick={() => router.push("/withdraw?step=5")}>
          <Plus className="h-4 w-4 mr-2" />
          Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No bank accounts added yet.</p>
          <Button
            className="mt-4"
            onClick={() => router.push("/withdraw?step=5")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Account
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account: BankAccount) => (
            <Card key={account.id} className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">
                    {account.bankName || "Unknown Bank"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {account.accountName} •••• {account.lastFourDigits}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAccount(account)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Funds
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setAccountToDelete(account)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={accountToDelete !== null}
        onOpenChange={(open) => !open && setAccountToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bank Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this bank account? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {accountToDelete && (
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Bank:</strong> {accountToDelete.bankName || "Unknown"}
                </p>
                <p>
                  <strong>Account:</strong> {accountToDelete.accountName} ••••{" "}
                  {accountToDelete.lastFourDigits}
                </p>
              </div>
            )}
          </div>
          {deleteError && (
            <div className="text-sm text-destructive mb-4">
              {deleteError.message || "Failed to delete bank account"}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                accountToDelete &&
                accountToDelete.id &&
                deleteBankAccount(accountToDelete.id)
              }
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedAccount && (
        <SendFundsModal
          isOpen={selectedAccount !== null}
          onClose={() => setSelectedAccount(null)}
          bankAccount={{
            id: selectedAccount.id?.toString() || "",
          }}
        />
      )}
    </div>
  );
}
