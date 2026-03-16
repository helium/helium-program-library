import { clsx, type ClassValue } from "clsx";
import { Metadata } from "next";
import { twMerge } from "tailwind-merge";
export type Schedule = "daily" | "weekly" | "monthly";
export type ReturnAddress = "me" | "recipient" | "custom";

export interface WelcomePackSchedule {
  frequency: Schedule;
  time: string; // HH:mm in local time
  timezone: string; // e.g. 'America/New_York'
  dayOfWeek?: string; // For weekly schedules
  dayOfMonth?: string; // For monthly schedules
}

// Convert local time to UTC cron expression
export function scheduleToUtcCron(schedule: WelcomePackSchedule): string {
  const [hours, minutes] = schedule.time.split(":").map(Number);

  // Get the current time in both UTC and the target timezone
  const now = new Date();
  const utcNow = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzNow = new Date(
    now.toLocaleString("en-US", { timeZone: schedule.timezone }),
  );

  // Calculate the offset in hours (positive means ahead of UTC)
  const offset = (tzNow.getTime() - utcNow.getTime()) / (1000 * 60 * 60);

  // Convert local time to UTC by subtracting the offset
  let utcHours = hours - offset;
  let dayOffset = 0;

  // Handle day wraparound
  if (utcHours >= 24) {
    utcHours -= 24;
    dayOffset = 1;
  }
  if (utcHours < 0) {
    utcHours += 24;
    dayOffset = -1;
  }

  switch (schedule.frequency) {
    case "daily":
      return `${0} ${minutes} ${Math.floor(utcHours)} * * *`;
    case "weekly": {
      // Convert day name to number (1-7, where 1 is Monday)
      const days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      let dayIndex = days.indexOf(schedule.dayOfWeek || "Monday") + 1;

      // Adjust day based on UTC wraparound
      dayIndex += dayOffset;
      if (dayIndex > 7) dayIndex = 1;
      if (dayIndex < 1) dayIndex = 7;

      return `${0} ${minutes} ${Math.floor(utcHours)} * * ${dayIndex}`;
    }
    case "monthly": {
      // For monthly schedules, we need to handle month boundaries
      const dayOfMonth = parseInt(schedule.dayOfMonth || "1") + dayOffset;

      // Create a date object to test the actual UTC day
      const testDate = new Date();
      testDate.setDate(dayOfMonth);
      testDate.setHours(hours, minutes, 0, 0);

      // Convert to UTC
      const utcTestDate = new Date(
        testDate.toLocaleString("en-US", {
          timeZone: schedule.timezone,
        }) + " UTC",
      );

      // Use the UTC day as our cron day
      const utcDayOfMonth = utcTestDate.getUTCDate();

      return `${0} ${minutes} ${Math.floor(utcHours)} ${utcDayOfMonth} * *`;
    }
    default:
      throw new Error("Invalid schedule frequency");
  }
}

export const toSixColumnCron = (fiveColCron: string): string =>
  `0 ${fiveColCron}`;

export const toFiveColumnCron = (sixColCron: string): string =>
  sixColCron.replace(/^0\s+/, "");

export const truncateAddress = (
  address: string,
  startChars: number = 6,
  endChars: number = 4,
) => {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}....${address.slice(-endChars)}`;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formMetaTags = (args?: {
  title?: string;
  description?: string;
  openGraphImageAbsoluteUrl?: string;
  url?: string;
}) => {
  const { title, description, openGraphImageAbsoluteUrl, url } = args || {};
  const metaTitle = title ? `${title} — My Helium` : "My Helium";
  const metaDescription = description
    ? description
    : "Simple Helium Hotspot Hosting.";
  const metaImage = openGraphImageAbsoluteUrl
    ? openGraphImageAbsoluteUrl
    : "https://my.helium.com/images/o-g.png";
  const metaUrl = url ? url : "https://my.helium.com";

  return {
    metadataBase: new URL("https://my.helium.com"),
    icons: ["/favicon.ico"],
    title: metaTitle,
    description: metaDescription,
    itemProps: {
      name: metaTitle,
      description: metaDescription,
      image: metaImage,
    },
    twitter: {
      title: metaTitle,
      description: metaDescription,
      image: metaImage,
      card: "summary_large_image",
      site: "@helium",
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      image: metaImage,
      url: metaUrl,
      site_name: "My Helium",
      locale: "en_US",
      type: "website",
    },
  } as Metadata;
};
