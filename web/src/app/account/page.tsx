import { Suspense } from "react";

import AccountPageClient from "./AccountPageClient";

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-background" />}>
      <AccountPageClient />
    </Suspense>
  );
}
