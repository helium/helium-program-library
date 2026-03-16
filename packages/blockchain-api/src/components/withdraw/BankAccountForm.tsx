"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { client } from "@/lib/orpc";

interface BankAccountFormProps {
  onSuccess: () => void;
  isBusinessAccount: boolean;
}

// Routing number validation
const validateRoutingNumber = (value: string) => {
  // Remove any spaces or hyphens
  value = value.replace(/[\s-]/g, "");

  // Check if it's exactly 9 digits
  if (!/^\d{9}$/.test(value)) return false;

  // Check if first 8 digits are not all zeros
  if (/^0{8}/.test(value)) return false;

  // Calculate checksum
  const digits = value.split("").map(Number);
  const weights = [3, 7, 1, 3, 7, 1, 3, 7];
  const sum = digits
    .slice(0, 8)
    .reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === digits[8];
};

// Base schema without first/last name
const baseSchema = {
  accountName: z.string().min(1, "Account name is required"),
  bankName: z.string().min(1, "Bank name is required"),
  accountNumber: z
    .string()
    .min(8, "Account number must be at least 8 digits")
    .max(17, "Account number must be at most 17 digits")
    .regex(/^\d+$/, "Account number must contain only digits"),
  routingNumber: z
    .string()
    .refine(validateRoutingNumber, "Invalid routing number"),
  accountType: z.enum(["checking", "savings"]),
  address: z.object({
    streetLine1: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().length(2, "State must be 2 characters"),
    postalCode: z
      .string()
      .regex(
        /^\d{5}(-\d{4})?$/,
        "Invalid ZIP code format (e.g. 12345 or 12345-6789)",
      ),
    country: z.literal("USA"),
  }),
} as const;

// Individual account schema
const individualSchema = z.object({
  ...baseSchema,
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

// Business account schema
const businessSchema = z.object({
  ...baseSchema,
  businessName: z.string().min(1, "Business name is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type BaseFormData = z.infer<typeof individualSchema>;
type BusinessFormData = z.infer<typeof businessSchema>;
type FormData = BaseFormData | BusinessFormData;

export function BankAccountForm({
  onSuccess,
  isBusinessAccount,
}: BankAccountFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(
      isBusinessAccount ? businessSchema : individualSchema,
    ),
    defaultValues: {
      accountType: "checking",
      address: {
        country: "USA",
      },
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await client.fiat.createBankAccount({
        currency: "usd",
        account_type: "us",
        bank_name: data.bankName,
        account_name: data.accountName,
        ...(isBusinessAccount && "businessName" in data
          ? {
              business_name: data.businessName,
              // Only include first/last name if provided
              ...(data.firstName && { first_name: data.firstName }),
              ...(data.lastName && { last_name: data.lastName }),
              ...(data.firstName &&
                data.lastName && {
                  account_owner_name: `${data.firstName} ${data.lastName}`,
                }),
            }
          : {
              first_name: data.firstName!,
              last_name: data.lastName!,
              account_owner_name: `${data.firstName} ${data.lastName}`,
            }),
        account: {
          routing_number: data.routingNumber,
          account_number: data.accountNumber,
          checking_or_savings: data.accountType,
        },
        address: {
          street_line_1: data.address.streetLine1,
          country: data.address.country,
          state: data.address.state,
          city: data.address.city,
          postal_code: data.address.postalCode,
        },
      });

      onSuccess();
    } catch (error) {
      console.error("Error adding bank account:", error);
      form.setError("root", {
        message:
          error instanceof Error ? error.message : "Failed to add bank account",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {isBusinessAccount && (
          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {(!isBusinessAccount ||
          (isBusinessAccount && form.watch("firstName") !== undefined)) && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isBusinessAccount
                      ? "Contact First Name (Optional)"
                      : "First Name"}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isBusinessAccount
                      ? "Contact Last Name (Optional)"
                      : "Last Name"}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="accountName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Personal Checking" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bankName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Chase, Bank of America" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="routingNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Routing Number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accountType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <h3 className="font-medium">Address</h3>

          <FormField
            control={form.control}
            name="address.streetLine1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. CA" maxLength={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address.postalCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ZIP Code</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. 12345 or 12345-6789" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {form.formState.errors.root && (
          <p className="text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? "Adding Bank Account..." : "Add Bank Account"}
        </Button>
      </form>
    </Form>
  );
}
