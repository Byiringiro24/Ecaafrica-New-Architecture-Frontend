/**
 * DeviceStatusCards — live-status version
 *
 * Accepts LiveDeviceStatus[] from useLiveDeviceStatuses().
 * Never reads is_connected or last_seen_at from the database.
 *
 * Also exports DeviceRecord type for backwards compatibility with pages
 * that still receive device list data, and isDeviceOnline as a fallback
 * for those pages until they migrate to the live hook.
 */
import { MapPin, Wifi, WifiOff } from "lucide-react";
import { StatCard } from "@/components/ui-kit/StatCard";
import type { LiveDeviceStatus } from "@/lib/liveDeviceStatus";
import { tierDotClass } from "@/lib/liveDeviceStatus";

// ── Backwards-compat type ─────────────────────────────────────────────────────
// Pages that still use GET /devices (DB list) pass this type. Kept so existing
// code doesn't break while migrating. Use LiveDeviceStatus everywhere new.
export type DeviceRecord = {
  id: string;
  name: string;
  device_uid?: string;
  location?: string | null;
  mode?: string | null;
  type?: string | null;
  is_active?: boolean;
  is_online?: boolean;
  is_connected?: boolean;
  last_seen_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  status?: string | null;
};

/**
 * isDeviceOnline — legacy helper for pages not yet using useLiveDeviceStatuses.
 * Uses DB fields with a 2-minute grace window. Migrate pages to live hook to
 * remove this dependency.
 */
export function isDeviceOnline(device: DeviceRecord): boolean {
  if (device.is_online === true)  return true;
  if (device.is_online === false) return false;
  if (device.is_connected === false) return false;
  if (device.is_connected === true)  return true;
  if (device.last_seen_at) {
    return Date.now() - new Date(device.last_seen_at).getTime() < 2 * 60 * 1000;
  }
  return false;
}

// ── Live-status cards ─────────────────────────────────────────────────────────

type LocationRow = { label: string; online: number; bridge: number; offline: number };

function buildLocationRows(devices: LiveDeviceStatus[]): LocationRow[] {
  const grouped = devices.reduce((acc, d) => {
    const key   = (d.location_scope ?? d.mode ?? "unknown").toLowerCase();
    const label = d.location ?? d.location_scope ?? d.mode ?? "Unknown";
    const cur   = acc.get(key) ?? { label, online: 0, bridge: 0, offline: 0 };
    if (d.connection_tier === "full")   cur.online++;
    else if (d.connection_tier === "bridge") cur.bridge++;
    else                                     cur.offline++;
    acc.set(key, cur);
    return acc;
  }, new Map<string, LocationRow>());
  return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * DeviceStatusCards — primary version using live status.
 * Pass statuses from useLiveDeviceStatuses().
 */
export function DeviceStatusCards({ statuses }: { statuses: LiveDeviceStatus[] }) {
  const online   = statuses.filter(d => d.connection_tier === "full").length;
  const bridge   = statuses.filter(d => d.connection_tier === "bridge").length;
  const offline  = statuses.filter(d => d.connection_tier === "offline").length;
  const rows     = buildLocationRows(statuses);

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      <StatCard
        label="Online Devices"
        value={online}
        icon={<Wifi className="h-5 w-5" />}
        trend={`${statuses.length} total — FK623 + bridge + WireGuard`}
        tone="success"
      />
      <StatCard
        label="Offline Devices"
        value={offline + bridge}
        icon={<WifiOff className="h-5 w-5" />}
        trend={
          offline + bridge > 0
            ? `${offline} unreachable, ${bridge} bridge-only`
            : "All devices reachable"
        }
        tone={offline + bridge > 0 ? "destructive" : "primary"}
      />
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-muted-foreground truncate text-xs uppercase tracking-wider">
              Device Locations
            </p>
            <p className="font-bold truncate text-3xl mt-2">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Gate, dormitory, classroom and more</p>
          </div>
          <div className="grid shrink-0 place-items-center rounded-lg h-11 w-11 bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {rows.slice(0, 4).map(row => (
            <div key={row.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
              <span className="font-semibold truncate capitalize">{row.label}</span>
              <span className="text-muted-foreground shrink-0">
                <span className="text-green-600 font-medium">{row.online}</span>
                {row.bridge > 0 && <><span className="text-muted-foreground"> / </span><span className="text-yellow-600 font-medium">{row.bridge}</span></>}
                {" / "}
                <span className={row.offline > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>{row.offline}</span>
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No devices registered yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * DeviceStatusCardsLegacy — for pages still using DeviceRecord[] from GET /devices.
 * Remove when all pages migrate to useLiveDeviceStatuses.
 */
export function DeviceStatusCardsLegacy({ devices }: { devices: DeviceRecord[] }) {
  const online  = devices.filter(isDeviceOnline).length;
  const offline = devices.length - online;
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <StatCard label="Online Devices"  value={online}  icon={<Wifi className="h-5 w-5" />}    tone="success" />
      <StatCard label="Offline Devices" value={offline} icon={<WifiOff className="h-5 w-5" />} tone={offline > 0 ? "destructive" : "primary"} />
    </div>
  );
}
