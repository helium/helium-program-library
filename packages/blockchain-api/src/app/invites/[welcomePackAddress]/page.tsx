import Invite from "@/components/Invite";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ welcomePackAddress: string }>;
  searchParams: Promise<{ expirationTs: string; signature: string }>;
}) {
  const { welcomePackAddress } = await params;
  const { expirationTs, signature } = await searchParams;
  return (
    <Invite
      welcomePackAddress={welcomePackAddress}
      expirationTs={expirationTs}
      signature={signature}
    />
  );
}
