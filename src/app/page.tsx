"use client";

import { SessionProvider, useSession } from "@/lib/session";
import { Unlock } from "@/components/Unlock";
import { Vault } from "@/components/Vault";

function Gate() {
  const { state } = useSession();
  if (state.status === "unlocked") {
    return <Vault encKey={state.encKey} email={state.email} />;
  }
  return <Unlock />;
}

export default function Page() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
