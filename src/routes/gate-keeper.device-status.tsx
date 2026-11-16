import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { GateKeeperLayout } from "@/components/layout/GateKeeperLayout";
import { gateKeeperRouteGuard } from "@/lib/schoolAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import {
  useLiveDeviceStatuses,
  tierDotClass,
  tierLabel,
  invalidateLiveStatusCache,
  type LiveDeviceStatus,
} from "@/lib/liveDeviceStatus";

export const Route = createFileRoute("/gate-keeper/device-status")({
  beforeLoad: ({ location }) => gateKeeperRouteGuard(location),
  component: GateKeeperDeviceStatusPage,
});

function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)      return "Just now";
  if (ms < 3_600_000)   return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)  return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function GateKeeperDeviceStatusPage() {
  const { statuses, checking, refresh } = useLiveDeviceStatuses(30_000);

  const onlineCount  = statuses.filter(d => d.connected).length;
  const offlineCount = statuses.length - onlineCount;
  const loading      = checking && statuses.length === 0;

  return (
    <GateKeeperLayout title="Device Status" subtitle="Live status of all campus biometric devices">
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-blue-600">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Checking device connections…
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {statuses.length} devices — {" "}
              <span className="text-green-600 font-semibold">{onlineCount} online</span>
              {offlineCount > 0 && <>, <span className="text-destructive font-semibold">{offlineCount} offline</span></>}
            </span>
          )}
        </div>
        <button
          onClick={() => { invalidateLiveStatusCache(); refresh(); }}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking…" : "Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Online</p>
          <p className="text-3xl font-bold text-green-600">{loading ? "—" : onlineCount}</p>
          <p className="text-xs text-muted-foreground mt-1">FK623 + bridge + WireGuard active</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Offline</p>
          <p className={`text-3xl font-bold ${offlineCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{loading ? "—" : offlineCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Bridge or FK623 unreachable</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Total</p>
          <p className="text-3xl font-bold">{loading ? "—" : statuses.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Registered devices</p>
        </div>
      </div>

      {/* Device table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : statuses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No devices registered. Contact the platform administrator.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-lg">All Devices — Live Status</h3>
            <span className="text-xs text-muted-foreground">
              {checking ? "Pinging bridges…" : "Refreshes every 30s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  {["Device", "UID", "Location", "Status", "Tier", "Last contact"].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statuses.map(device => (
                  <tr key={device.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${tierDotClass(device.connection_tier)}`} />
                        {device.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{device.device_uid}</td>
                    <td className="px-4 py-3">{device.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        device.connected
                          ? "bg-green-100 text-green-700"
                          : device.bridge_reachable
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                      }`}>
                        {device.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {device.connected ? "Online" : device.bridge_reachable ? "Bridge only" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-xs text-muted-foreground">{device.connection_tier}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {device.lastAttempt ? lastSeenLabel(device.lastAttempt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GateKeeperLayout>
  );
}

