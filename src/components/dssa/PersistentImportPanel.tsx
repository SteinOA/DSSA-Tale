import { useEffect, useState, type ReactNode } from "react";

// Preserve the renderer-owned file job and its temporary file while navigating.
// Only an explicit cancel or closing the application should end that session.
export default function PersistentImportPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  if (!visited && !active) return null;
  return (
    <div className={active ? "h-full" : "hidden"} hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  );
}
