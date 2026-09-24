import { Boxes } from "lucide-react";
import { ModuleLauncher } from "./ModuleLauncher";

/** Inventory inherits CRM access; this is a shortcut, not a new entitlement. */
export function InventoryLauncher() {
  return (
    <article className="business-access-card">
      <ModuleLauncher
        moduleKey="crm"
        label="Inventory"
        Icon={Boxes}
        accessible
        inventory
      />
    </article>
  );
}
