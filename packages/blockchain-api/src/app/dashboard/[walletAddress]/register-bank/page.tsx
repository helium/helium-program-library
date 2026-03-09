"use client";

import { useAsyncCallback } from "react-async-hook";
import { usePrivy } from "@privy-io/react-auth";
import { useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client, setAccessToken } from "@/lib/orpc";
import { useEffect } from "react";

export default function RegisterBankPage() {
  const { user, ready, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  // Set access token for ORPC client
  useEffect(() => {
    if (user) {
      getAccessToken().then((token) => {
        setAccessToken(token || null);
      });
    } else {
      setAccessToken(null);
    }
  }, [user, getAccessToken]);

  const {
    loading,
    error,
    execute: registerBankAccount,
  } = useAsyncCallback(
    async (formData: FormData) => {
      if (!user?.id) throw new Error("User not authenticated");

      // Ensure access token is set before making the call
      const token = await getAccessToken();
      setAccessToken(token || null);

      await client.fiat.createBankAccount({
        currency: "usd",
        account_type: "checking", // Default, can be updated if needed
        bank_name: formData.get("bankName") as string,
        account_name: formData.get("accountName") as string,
        first_name: formData.get("firstName") as string,
        last_name: formData.get("lastName") as string,
        account_owner_name: formData.get("accountName") as string,
        account: {
          account_number: formData.get("accountNumber") as string,
          routing_number: formData.get("routingNumber") as string,
          checking_or_savings: formData.get("accountType") as string,
        },
        address: {
          street_line_1: formData.get("streetLine1") as string,
          line2: (formData.get("streetLine2") as string) || undefined,
          city: formData.get("city") as string,
          state: formData.get("state") as string,
          postal_code: formData.get("postalCode") as string,
          country: "USA",
        },
      });

      router.push(`/dashboard/${user.id}`);
    },
    {
      onError: (error) => {
        console.error("Error registering bank account:", error);
      },
    },
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await registerBankAccount(formData);
  };

  // If not authenticated, show login
  if (ready && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Button onClick={login}>Login to continue</Button>
      </div>
    );
  }

  // Show loading state while checking auth
  if (!ready) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Register Bank Account</h1>

      {error && (
        <div className="mb-4 p-4 text-red-600 bg-red-50 rounded-md">
          {error.message ||
            "Failed to register bank account. Please try again."}
        </div>
      )}

      <Card className="max-w-lg mx-auto p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="John"
                required
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" name="lastName" placeholder="Doe" required />
            </div>
          </div>

          <div>
            <Label htmlFor="accountName">Account Name</Label>
            <Input
              id="accountName"
              name="accountName"
              placeholder="e.g. My Checking Account"
              required
            />
          </div>

          <div>
            <Label htmlFor="bankName">Bank Name</Label>
            <Input
              id="bankName"
              name="bankName"
              placeholder="e.g. Chase"
              required
            />
          </div>

          <div>
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              type="text"
              pattern="[0-9]*"
              placeholder="Enter your account number"
              required
            />
          </div>

          <div>
            <Label htmlFor="routingNumber">Routing Number</Label>
            <Input
              id="routingNumber"
              name="routingNumber"
              type="text"
              pattern="[0-9]*"
              placeholder="Enter your routing number"
              required
            />
          </div>

          <div>
            <Label htmlFor="accountType">Account Type</Label>
            <Select name="accountType" defaultValue="checking" required>
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="streetLine1">Street Address</Label>
            <Input
              id="streetLine1"
              name="streetLine1"
              placeholder="1234 Main St"
              required
            />
          </div>

          <div>
            <Label htmlFor="streetLine2">Apartment, suite, etc.</Label>
            <Input id="streetLine2" name="streetLine2" placeholder="Apt 4B" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                placeholder="San Francisco"
                required
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" placeholder="CA" required />
            </div>
          </div>

          <div>
            <Label htmlFor="postalCode">ZIP Code</Label>
            <Input
              id="postalCode"
              name="postalCode"
              placeholder="94105"
              pattern="[0-9]*"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Registering..." : "Register Bank Account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
