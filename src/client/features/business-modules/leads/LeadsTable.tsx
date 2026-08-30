import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Search, X } from "lucide-react";
import {
  HEALTH_META,
  LEAD_HEALTHS,
  LEAD_PRIORITIES,
  PRIORITY_META,
  type LeadHealth,
} from "@/shared/leads-command";
import {
  LEAD_COLUMNS,
  LeadCell,
  cellValue,
  contactName,
  leadHealth,
  type ColumnKey,
  type LeadRow,
  type MemberLookup,
} from "./leadColumns";

const HIDDEN_STORAGE_KEY = "openseo:leads:hidden-columns";

function defaultHidden(): Set<ColumnKey> {
  return new Set(
    LEAD_COLUMNS.filter((column) => column.defaultHidden).map(
      (column) => column.key,
    ),
  );
}

/**
 * Read after mount, never during render: the server has no localStorage, so
 * seeding state from it would render a different set of columns on the server
 * than on the client and break hydration.
 */
function readStoredHidden(): Set<ColumnKey> | null {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const known = new Set<string>(LEAD_COLUMNS.map((column) => column.key));
    return new Set(
      parsed.filter((key): key is ColumnKey => known.has(String(key))),
    );
  } catch {
    // A private window, cleared site data, or a browser that blocks storage.
    // The table must still render, just with the default columns.
    return null;
  }
}

type Sort = { key: ColumnKey; direction: 1 | -1 } | null;

export function LeadsTable({
  rows,
  members,
  onOpenLead,
}: {
  rows: readonly LeadRow[];
  members: ReadonlyArray<{ id: string; name: string | null; email: string }>;
  onOpenLead?: (leadId: string) => void;
}) {
  const [hidden, setHidden] = useState<Set<ColumnKey>>(defaultHidden);
  const [sort, setSort] = useState<Sort>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<Set<LeadHealth>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const stored = readStoredHidden();
    if (stored) setHidden(stored);
  }, []);

  const memberLookup: MemberLookup = useMemo(
    () => new Map(members.map((m) => [m.id, m.name || m.email])),
    [members],
  );

  const stageNames = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.stage?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ),
    [rows],
  );

  const visible = LEAD_COLUMNS.filter((column) => !hidden.has(column.key));

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (healthFilter.size && !healthFilter.has(leadHealth(row))) return false;
      if (priorityFilter.size && !priorityFilter.has(row.lead.priority))
        return false;
      if (stageFilter && row.stage?.name !== stageFilter) return false;
      if (!needle) return true;
      // Search the whole lead, not only the columns currently shown —
      // hiding a column is about width, not about what exists.
      return [
        row.company?.name,
        contactName(row),
        row.lead.title,
        row.lead.category,
        row.lead.source,
        row.lead.notes,
        row.contact?.email,
        row.company?.website,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [rows, search, healthFilter, priorityFilter, stageFilter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = cellValue(a, sort.key, memberLookup);
      const right = cellValue(b, sort.key, memberLookup);
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * sort.direction;
      }
      return String(left).localeCompare(String(right)) * sort.direction;
    });
    return copy;
  }, [filtered, sort, memberLookup]);

  const persist = (next: Set<ColumnKey>) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(next);
  };

  const toggleSort = (key: ColumnKey) => {
    setSort((current) =>
      current?.key === key
        ? current.direction === 1
          ? { key, direction: -1 }
          : null
        : { key, direction: 1 },
    );
  };

  const filtersActive =
    Boolean(search) ||
    healthFilter.size > 0 ||
    priorityFilter.size > 0 ||
    Boolean(stageFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered input-sm flex flex-1 items-center gap-2 md:max-w-xs">
          <Search className="size-4 shrink-0 text-base-content/40" />
          <input
            className="grow"
            placeholder="Search leads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <select
          className="select select-bordered select-sm"
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
        >
          <option value="">All stages</option>
          {stageNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <FilterChips
          options={LEAD_HEALTHS.map((key) => ({
            key,
            label: HEALTH_META[key].label,
          }))}
          selected={healthFilter}
          onToggle={(key) => {
            const next = new Set(healthFilter);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setHealthFilter(next);
          }}
        />

        <FilterChips
          options={LEAD_PRIORITIES.map((key) => ({
            key,
            label: PRIORITY_META[key].label,
          }))}
          selected={priorityFilter}
          onToggle={(key) => {
            const next = new Set(priorityFilter);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setPriorityFilter(next);
          }}
        />

        {filtersActive ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              setHealthFilter(new Set());
              setPriorityFilter(new Set());
              setStageFilter("");
            }}
          >
            <X className="size-4" /> Clear
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-base-content/50">
            {sorted.length} of {rows.length}
          </span>
          <details
            className="dropdown dropdown-end"
            open={showPicker}
            onToggle={(event) => setShowPicker(event.currentTarget.open)}
          >
            <summary className="btn btn-outline btn-sm">
              <Columns3 className="size-4" /> Columns
            </summary>
            <ul className="dropdown-content z-10 max-h-96 w-56 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
              {LEAD_COLUMNS.map((column) => (
                <li key={column.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-base-200">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={!hidden.has(column.key)}
                      onChange={() => toggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-pin-rows table-xs">
          <thead>
            <tr>
              {visible.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width, minWidth: column.width }}
                  className={column.sortable ? "cursor-pointer" : undefined}
                  onClick={
                    column.sortable ? () => toggleSort(column.key) : undefined
                  }
                >
                  <span className="flex items-center gap-1">
                    {column.label}
                    {sort?.key === column.key ? (
                      sort.direction === 1 ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visible.length}
                  className="py-10 text-center text-base-content/40"
                >
                  {rows.length === 0
                    ? "No leads yet."
                    : "No leads match these filters."}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.lead.id}
                  className={onOpenLead ? "cursor-pointer hover" : "hover"}
                  onClick={
                    onOpenLead ? () => onOpenLead(row.lead.id) : undefined
                  }
                >
                  {visible.map((column) => (
                    <td
                      key={column.key}
                      style={{ maxWidth: column.width }}
                      className="truncate"
                    >
                      <LeadCell
                        row={row}
                        column={column.key}
                        members={memberLookup}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ key: T; label: string }>;
  selected: ReadonlySet<T>;
  onToggle: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.key}
          className={`badge badge-sm cursor-pointer ${
            selected.has(option.key) ? "badge-primary" : "badge-outline"
          }`}
          onClick={() => onToggle(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
