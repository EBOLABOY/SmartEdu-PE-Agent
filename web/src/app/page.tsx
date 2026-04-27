import { Suspense } from "react";

import SmartEduWorkspace from "@/components/workspace/SmartEduWorkspace";

export default function App() {
  return (
    <Suspense fallback={null}>
      <SmartEduWorkspace />
    </Suspense>
  );
}
