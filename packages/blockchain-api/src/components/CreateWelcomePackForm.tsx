import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import WelcomePack from "@/lib/models/welcome-pack";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { HNT_MINT } from "@helium/spl-utils";
import { hntToBonesBN, solToLamportsBN } from "@/lib/utils/token-math";
import { useQueryClient } from "@tanstack/react-query";
import { Trash, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { Hotspot, HotspotsData } from "@/types/hotspot";
import type {
  WelcomePackCreateInput as CreateWelcomePackRequest,
  WelcomePack as WelcomePackType,
} from "@helium/blockchain-api";
import { client } from "@/lib/orpc";

type RewardType = "fixed" | "percentage";
type Schedule = "daily" | "weekly" | "monthly";
type ReturnAddress = "me" | "recipient" | "custom";

interface Recipient {
  address: string;
  amount: number | string;
  type: RewardType;
}

interface CreateWelcomePackFormProps {
  hotspot: Hotspot;
  onClose: () => void;
}

export const HNT_LAZY_DISTRIBUTOR_ADDRESS =
  "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq";

// Days of the week starting from Monday (to match cron)
const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function CreateWelcomePackForm({
  hotspot,
  onClose,
}: CreateWelcomePackFormProps) {
  const { user } = usePrivy();
  const walletAddress = useWalletAddress();
  const queryClient = useQueryClient();
  const { submitTransactions } = useTransactionSubmission();
  const [ownerReward, setOwnerReward] = useState<Recipient>({
    address: "",
    amount: 30,
    type: "percentage",
  });
  const [recipientReward, setRecipientReward] = useState<Recipient>({
    address: "",
    amount: 70,
    type: "percentage",
  });
  const [recipientHasWallet, setRecipientHasWallet] = useState<boolean>(false);
  const [additionalRecipients, setAdditionalRecipients] = useState<Recipient[]>(
    [],
  );
  const [schedule, setSchedule] = useState<Schedule>("monthly");
  // Default to now
  const [scheduleTime, setScheduleTime] = useState(
    new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  // Default to current day of week (0-6, where 0 is Sunday)
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(
    DAYS_OF_WEEK[new Date().getDay()],
  );
  // Default to current day of month (1-31)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(
    new Date().getDate().toString(),
  );
  const [returnAddress, setReturnAddress] = useState<ReturnAddress>("me");
  const [customReturnAddress, setCustomReturnAddress] = useState("");
  const [solAmount, setSolAmount] = useState<string>("0.01");

  const handleNumberInput = (value: string, defaultValue: number) => {
    if (value === "") return "";
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Calculate total percentage and validate
  const { totalPercentage, isValid, validationError } = useMemo(() => {
    if (
      ownerReward.type !== "percentage" ||
      recipientReward.type !== "percentage"
    ) {
      return { totalPercentage: 0, isValid: true, validationError: null };
    }

    const percentageRecipients = additionalRecipients.filter(
      (r) => r.type === "percentage",
    );

    const ownerAmount =
      typeof ownerReward.amount === "string" ? 0 : ownerReward.amount;
    const recipientAmount =
      typeof recipientReward.amount === "string" ? 0 : recipientReward.amount;
    const additionalAmount = percentageRecipients.reduce((sum, r) => {
      const amount = typeof r.amount === "string" ? 0 : r.amount;
      return sum + amount;
    }, 0);

    const total = ownerAmount + recipientAmount + additionalAmount;

    return {
      totalPercentage: total,
      isValid: total === 100,
      validationError:
        total !== 100
          ? `Total percentage must equal 100%. Current total: ${total.toFixed(
              2,
            )}%`
          : null,
    };
  }, [ownerReward, recipientReward, additionalRecipients]);

  const handleSubmitAsync = async () => {
    if (!walletAddress) throw new Error("Wallet not connected");
    if (!isValid)
      throw new Error(validationError || "Invalid percentage distribution");

    const ownerRewardWithDefaults = {
      ...ownerReward,
      address: walletAddress!,
      amount: typeof ownerReward.amount === "string" ? 30 : ownerReward.amount,
    };

    if (recipientHasWallet && !recipientReward.address) {
      throw new Error("Recipient wallet address is required");
    }

    const recipientRewardWithDefaults = {
      ...recipientReward,
      address: recipientHasWallet
        ? recipientReward.address
        : recipientReward.address || PublicKey.default.toBase58(),
      amount:
        typeof recipientReward.amount === "string"
          ? 70
          : recipientReward.amount,
    };

    const validAdditionalRecipients = additionalRecipients
      .filter((recipient) => recipient.address && recipient.amount)
      .map((recipient) => ({
        ...recipient,
        amount: typeof recipient.amount === "string" ? 0 : recipient.amount,
      }));

    // Get the user's time zone
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // For weekly schedules, get the selected day
    const selectedDayOfWeek =
      schedule === "weekly" ? scheduleDayOfWeek : undefined;

    // For monthly schedules, get the selected day
    const selectedDayOfMonth =
      schedule === "monthly" ? scheduleDayOfMonth : undefined;

    const parsedSolAmount = parseFloat(solAmount);

    if (!Number.isFinite(parsedSolAmount) || parsedSolAmount <= 0) {
      throw new Error("SOL amount must be a positive number");
    }

    const requestBody: CreateWelcomePackRequest = {
      walletAddress: walletAddress!,
      assetId: hotspot.asset,
      solAmount: {
        amount: solToLamportsBN(
          Number.isFinite(parsedSolAmount) && parsedSolAmount > 0
            ? parsedSolAmount
            : 0.01,
        ).toString(),
        mint: NATIVE_MINT.toBase58(),
      },
      rewardsSplit: [
        ownerRewardWithDefaults,
        recipientRewardWithDefaults,
        ...validAdditionalRecipients,
      ].map((r) =>
        r.type === "fixed"
          ? {
              address: r.address,
              type: "fixed" as const,
              tokenAmount: {
                amount: hntToBonesBN(Number(r.amount)).toString(),
                mint: HNT_MINT.toBase58(),
              },
            }
          : {
              address: r.address,
              type: "percentage" as const,
              amount: r.amount,
            },
      ),
      schedule: {
        frequency: schedule,
        time: scheduleTime,
        timezone: userTimeZone,
        dayOfWeek: selectedDayOfWeek,
        dayOfMonth: selectedDayOfMonth,
      },
      assetReturnAddress:
        returnAddress === "me"
          ? walletAddress!
          : returnAddress === "recipient"
            ? recipientReward.address || PublicKey.default.toBase58()
            : customReturnAddress,
      rentRefund: walletAddress!,
      lazyDistributor: HNT_LAZY_DISTRIBUTOR_ADDRESS,
    };

    const useSplit =
      !!recipientHasWallet && !!recipientRewardWithDefaults.address;

    let transactionData: Awaited<
      ReturnType<typeof client.welcomePacks.create>
    >["transactionData"];
    let welcomePack: WelcomePackType | undefined;

    if (useSplit) {
      const result = await client.hotspots.createSplit({
        hotspotPubkey: hotspot.asset,
        ...requestBody,
      });
      transactionData = result.transactionData;
    } else {
      const result = await client.welcomePacks.create({
        ...requestBody,
      });
      transactionData = result.transactionData;
      welcomePack = result.welcomePack;
      welcomePack.hotspot = hotspot;
    }

    const welcomePackQueryKey = ["welcome-packs", walletAddress];

    // Update all hotspot queries that match the wallet address
    const updateHotspotQueries = (
      updater: (old: HotspotsData | undefined) => HotspotsData | undefined,
    ) => {
      // Get all existing queries
      const existingQueries = queryClient.getQueriesData<HotspotsData>({
        queryKey: ["owned-hotspots", walletAddress],
      });

      // Update each matching query
      existingQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, updater);
      });
    };

    // For split flow, we'll do the optimistic hotspot update in onSubmitted
    const previousSnapshots: Array<{
      key: unknown[];
      data: HotspotsData | undefined;
    }> = [];

    await submitTransactions(
      transactionData,
      useSplit
        ? {
            onSubmitted: () => {
              // Optimistically set the hotspot's shares
              const percentageRecipients = [
                ownerRewardWithDefaults,
                recipientRewardWithDefaults,
                ...validAdditionalRecipients,
              ].filter((r) => r.type === "percentage");
              const totalPercentage = percentageRecipients.reduce(
                (sum, r) => sum + (typeof r.amount === "string" ? 0 : r.amount),
                0,
              );

              // Snapshot and update all matching hotspot queries
              const existingQueries = queryClient.getQueriesData<HotspotsData>({
                queryKey: ["owned-hotspots", walletAddress],
              });
              existingQueries.forEach(([queryKey, data]) => {
                previousSnapshots.push({ key: queryKey as unknown[], data });
              });
              updateHotspotQueries((old: HotspotsData | undefined) => {
                if (!old) return old;
                return {
                  ...old,
                  hotspots: old.hotspots.map((h) =>
                    h.asset === hotspot.asset
                      ? {
                          ...h,
                          ownershipType: "fanout",
                          shares: {
                            percentage:
                              ownerRewardWithDefaults.amount / totalPercentage,
                            fixed:
                              recipientRewardWithDefaults.type === "fixed" &&
                              typeof recipientRewardWithDefaults.amount !==
                                "string"
                                ? String(recipientRewardWithDefaults.amount)
                                : h.shares?.fixed,
                          },
                        }
                      : h,
                  ),
                };
              });

              onClose();
            },
            onError: () => {
              // Roll back shares optimistic update
              previousSnapshots.forEach(({ key, data }) => {
                queryClient.setQueryData(key, data);
              });
            },
          }
        : {
            onSubmitted: () => {
              // Update welcome packs cache
              queryClient.setQueryData(
                welcomePackQueryKey,
                (old: WelcomePack[] = []) => [...old, welcomePack!],
              );

              // Optimistically remove hotspot from all matching queries
              updateHotspotQueries((old: HotspotsData | undefined) => {
                if (!old) return old;
                return {
                  ...old,
                  hotspots: old.hotspots.filter(
                    (h) => h.asset !== hotspot.asset,
                  ),
                  total: old.total - 1,
                };
              });

              onClose();
            },
            onSuccess: () => {
              queryClient.setQueryData(
                welcomePackQueryKey,
                (old: WelcomePack[] = []) => {
                  return old.map((pack) =>
                    pack.id === welcomePack!.id
                      ? { ...pack, loading: false }
                      : pack,
                  );
                },
              );
            },
            onError: () => {
              // Remove welcome pack from cache
              queryClient.setQueryData(
                welcomePackQueryKey,
                (old: WelcomePack[] = []) =>
                  old.filter((pack) => pack.id !== welcomePack!.id),
              );

              // Add hotspot back to all matching queries
              updateHotspotQueries((old: HotspotsData | undefined) => {
                if (!old) return old;
                return {
                  ...old,
                  hotspots: [...old.hotspots, hotspot],
                  total: old.total + 1,
                };
              });
            },
          },
    );
  };

  const {
    execute: handleSubmit,
    loading: isSubmitting,
    error,
  } = useAsyncCallback(handleSubmitAsync);

  const addRecipient = () => {
    setAdditionalRecipients([
      ...additionalRecipients,
      { address: "", amount: 0, type: "percentage" },
    ]);
  };

  const removeRecipient = (index: number) => {
    setAdditionalRecipients(additionalRecipients.filter((_, i) => i !== index));
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col space-y-6 p-4 sm:p-0"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">
            Create {recipientHasWallet ? "Split" : "Welcome Pack"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Configure rewards distribution for {hotspot.name}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20">
            {error.message}
          </div>
        )}

        {validationError && (
          <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20">
            {validationError}
          </div>
        )}

        {/* SOL Amount */}
        {!recipientHasWallet && (
          <div className="space-y-2">
            <Label htmlFor="sol-amount">SOL Amount</Label>
            <Input
              id="sol-amount"
              type="number"
              value={solAmount}
              onChange={(e) => setSolAmount(e.target.value)}
              min="0"
              step="any"
              placeholder="0.01"
              className="text-sm"
            />
            <p className="text-sm text-muted-foreground">
              The amount of SOL that will be deposited into the recipient&apos;s
              wallet to ensure they can execute transactions
            </p>
          </div>
        )}

        {/* Owner Rewards */}
        <div className="space-y-2">
          <Label>Your Rewards</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={ownerReward.amount || ""}
              onChange={(e) =>
                setOwnerReward({
                  ...ownerReward,
                  amount: handleNumberInput(e.target.value, 30),
                })
              }
              min="0"
              step={ownerReward.type === "percentage" ? "0.01" : "1"}
              max={ownerReward.type === "percentage" ? "100" : undefined}
              placeholder="30"
              className="flex-1 text-sm"
            />
            <Select
              value={ownerReward.type}
              onValueChange={(value: RewardType) =>
                setOwnerReward({ ...ownerReward, type: value })
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">%</SelectItem>
                <SelectItem value="fixed">HNT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recipient Rewards */}
        <div className="space-y-2">
          <Label>Recipient Rewards</Label>

          <div className="flex gap-2">
            <Input
              type="number"
              value={recipientReward.amount || ""}
              onChange={(e) =>
                setRecipientReward({
                  ...recipientReward,
                  amount: handleNumberInput(e.target.value, 70),
                })
              }
              min="0"
              step={recipientReward.type === "percentage" ? "0.01" : "1"}
              max={recipientReward.type === "percentage" ? "100" : undefined}
              placeholder="70"
              className="flex-1 text-sm"
            />
            <Select
              value={recipientReward.type}
              onValueChange={(value: RewardType) =>
                setRecipientReward({ ...recipientReward, type: value })
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">%</SelectItem>
                <SelectItem value="fixed">HNT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              id="recipient-has-wallet"
              type="checkbox"
              checked={recipientHasWallet}
              onChange={(e) => setRecipientHasWallet(e.target.checked)}
              className="w-4 h-4"
            />
            <Label
              htmlFor="recipient-has-wallet"
              className="font-normal text-sm"
            >
              Recipient already has a wallet
            </Label>
          </div>
          {recipientHasWallet && (
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Recipient wallet address"
                value={recipientReward.address}
                onChange={(e) =>
                  setRecipientReward({
                    ...recipientReward,
                    address: e.target.value,
                  })
                }
                className="text-sm"
              />
            </div>
          )}
          {!recipientHasWallet && (
            <p className="text-sm text-muted-foreground">
              After creating a welcome pack, you will be able to generate an
              invite link. Whoever follows that invite link will be able to
              enter their wallet address or create a new wallet as the recipient
            </p>
          )}
        </div>

        {/* Additional Recipients */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Additional Recipients</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addRecipient}
            >
              Add Recipient
            </Button>
          </div>
          {!additionalRecipients.length && (
            <div className="text-center py-6 px-4 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10">
              <UserPlus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm mb-1">
                No additional recipients yet
              </p>
              <p className="text-muted-foreground/70 text-xs">
                Click &apos;Add Recipient&apos; to add one
              </p>
            </div>
          )}
          {additionalRecipients.map((recipient, index) => (
            <div
              key={index}
              className="flex flex-col sm:flex-row gap-2 items-start"
            >
              <Input
                placeholder="Address"
                value={recipient.address}
                onChange={(e) => {
                  const newRecipients = [...additionalRecipients];
                  newRecipients[index].address = e.target.value;
                  setAdditionalRecipients(newRecipients);
                }}
                className="flex-1 text-sm"
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <Input
                  type="number"
                  value={recipient.amount || ""}
                  onChange={(e) => {
                    const newRecipients = [...additionalRecipients];
                    newRecipients[index].amount = handleNumberInput(
                      e.target.value,
                      0,
                    );
                    setAdditionalRecipients(newRecipients);
                  }}
                  min="0"
                  step={recipient.type === "percentage" ? "0.01" : "1"}
                  max={recipient.type === "percentage" ? "100" : undefined}
                  placeholder="0"
                  className="w-24 text-sm"
                />
                <Select
                  value={recipient.type}
                  onValueChange={(value: RewardType) => {
                    const newRecipients = [...additionalRecipients];
                    newRecipients[index].type = value;
                    setAdditionalRecipients(newRecipients);
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="fixed">HNT</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRecipient(index)}
                  className="p-2"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Distribution Schedule */}
        <div className="space-y-2">
          <Label>Distribution Schedule</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={schedule}
              onValueChange={(value: Schedule) => setSchedule(value)}
            >
              <SelectTrigger className="w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {schedule === "weekly" && (
              <Select
                value={scheduleDayOfWeek}
                onValueChange={(value: string) => setScheduleDayOfWeek(value)}
              >
                <SelectTrigger className="w-full sm:w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {schedule === "monthly" && (
              <Select
                value={scheduleDayOfMonth}
                onValueChange={(value: string) => setScheduleDayOfMonth(value)}
                aria-label="Select day of month"
              >
                <SelectTrigger className="w-full sm:w-auto">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const getOrdinal = (n: number) => {
                      if (n > 3 && n < 21) return "th";
                      switch (n % 10) {
                        case 1:
                          return "st";
                        case 2:
                          return "nd";
                        case 3:
                          return "rd";
                        default:
                          return "th";
                      }
                    };
                    return (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                        {getOrdinal(day)} Day
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            <Input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full sm:w-32"
            />
          </div>
        </div>

        {/* Return Address */}
        {!recipientHasWallet && (
          <Collapsible>
            <div className="flex items-center space-x-2">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 hover:bg-transparent"
                >
                  <ChevronDown className="h-4 w-4" />
                  <span className="ml-2 text-sm font-medium">
                    Advanced Settings
                  </span>
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="mt-4">
              <div className="space-y-3">
                <Label>Hotspot Return Address</Label>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="return-me"
                      value="me"
                      checked={returnAddress === "me"}
                      onChange={(e) =>
                        setReturnAddress(e.target.value as ReturnAddress)
                      }
                      className="w-4 h-4"
                    />
                    <Label htmlFor="return-me" className="font-normal text-sm">
                      Return to me
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="return-recipient"
                      value="recipient"
                      checked={returnAddress === "recipient"}
                      onChange={(e) =>
                        setReturnAddress(e.target.value as ReturnAddress)
                      }
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="return-recipient"
                      className="font-normal text-sm"
                    >
                      Return to recipient
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="return-custom"
                      value="custom"
                      checked={returnAddress === "custom"}
                      onChange={(e) =>
                        setReturnAddress(e.target.value as ReturnAddress)
                      }
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="return-custom"
                      className="font-normal text-sm"
                    >
                      Custom address
                    </Label>
                  </div>
                  {returnAddress === "custom" && (
                    <Input
                      value={customReturnAddress}
                      onChange={(e) => setCustomReturnAddress(e.target.value)}
                      placeholder="Enter return address"
                      className="mt-2 text-sm"
                    />
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex gap-3 pt-4 flex-grow justify-end items-end md:flex-grow-0 md:justify-end md:items-end">
          <Button
            variant="secondary"
            className="flex-1 text-sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !isValid}
            className="flex-1 text-sm"
          >
            {isSubmitting
              ? "Creating..."
              : `Create ${recipientHasWallet ? "Split" : "Welcome Pack"}`}
          </Button>
        </div>
      </form>
    </>
  );
}
