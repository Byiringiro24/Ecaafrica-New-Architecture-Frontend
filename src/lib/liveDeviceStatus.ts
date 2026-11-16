/**
 * liveDeviceStatus.ts
 *
 * The ONLY source of truth for device online/offline status in the entire
 * frontend. Every page — school admin, boarding, gate-keeper, DOD, patron —
 * must use this module for device status. Never use is_connected or
 * last_seen_at from the device list API.
 *
 * How it works:
 *   1. Calls GET /devices/live-status on the backend.
 *   2. The backend pings every bridge directly (GET /api/devices-config/status)
 *      and returns the actual FK623 connected state.
 *   3. Response takes 3–8 seconds (bridge timeout). The frontend shows a
 *      "Checking devices…" spinner during this window.
 *   4. Result is cached for CACHE_TTL_MS. Calling within the TTL returns the
 *      cached result instantly. Set force=true to bypass the cache.
 *
 * Status tiers:
 *   "full"    = bridge reachable + FK623 physically connected on school LAN
 *   "bridge"  = bridge reachable via WireGuard but FK623 not physically connected
 *   "offline" = bridge not reachable (WireGuard down, tablet off, no bridge configured)
 */

import { apiRequest } from "./api";

// How long a successful live-status result stays valid before the next fetch
const CACHE_TTL_MS = 15_000; // 15 seconds

export type LiveDeviceStatus = {
  id: string;
  name: string;
  device_uid: string;
  mode: string;
  location: string | null;
  location_scope: string | null;
  tablet_id: string | null;
  connected: boolean;
  connection_tier: "full" | "bridge" | "offline";
  error: string | null;
  lastAttempt: string | null;
  bridge_reachable: boolean;
};

type CacheEntry = {
  ts: number;
  data: LiveDeviceStatus[];
};

// Per-school cache (key = schoolId or "default")
const cache = new Map<string, CacheEntry>();
let inFlight: Promise<LiveDeviceStatus[]> | null = null;

/**
 * Fetch real-time status for all devices in the school.
 *
 * @param force - Skip the cache and always fetch fresh (e.g., on manual refresh)
 * @returns Array of LiveDeviceStatus — one entry per device
 */
export async function fetchLiveDeviceStatuses(force = false): Promise<LiveDeviceStatus[]> {
  const cacheKey = "default";
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // Deduplicate concurrent calls — only one in-flight request at a time
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await apiRequest<LiveDeviceStatus[]>("/devices/live-status", {
        auth: "school",
      });
      const data = Array.isArray(res) ? res : (res as any)?.data ?? [];
      cache.set(cacheKey, { ts: Date.now(), data });
      return data;
    } catch {
      // If the endpoint fails, return empty rather than crashing every page
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Invalidate the cache — call this after a manual "Check Status" or "Refresh"
 */
export function invalidateLiveStatusCache(): void {
  cache.clear();
}

/**
 * Get the live status for one specific device by its id.
 * Uses the cached result if available.
 */
export async function fetchLiveDeviceStatus(deviceId: string): Promise<LiveDeviceStatus | null> {
  const all = await fetchLiveDeviceStatuses();
  return all.find(d => d.id === deviceId) ?? null;
}

/**
 * React hook: loads and periodically refreshes live device status.
 *
 * Shows a 3-second "checking" state on first mount so the user sees a
 * clear "Pinging devices…" indicator before the real status appears.
 *
 * Usage:
 *   const { statuses, loading, checking, refresh } = useLiveDeviceStatuses();
 *
 * @param pollMs - How often to re-check (default: 30s). Set to 0 to disable polling.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useLiveDeviceStatuses(pollMs = 30_000) {
  const [statuses, setStatuses] = useState<LiveDeviceStatus[]>([]);
  const [loading, setLoading]   = useState(true);   // true only on first load
  const [checking, setChecking] = useState(true);   // true while pinging bridges
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!mountedRef.current) return;
    setChecking(true);
    try {
      const data = await fetchLiveDeviceStatuses(force);
      if (mountedRef.current) setStatuses(data);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Start the first load immediately. The 3-second "checking" UX comes
    // naturally from the bridge ping time (3–8s). We don't artificially delay.
    void load(true);

    // Periodic refresh
    if (pollMs > 0) {
      pollRef.current = setInterval(() => void load(false), pollMs);
    }

    return () => {
      mountedRef.current = false;
      if (timerRef.current)  clearTimeout(timerRef.current);
      if (pollRef.current)   clearInterval(pollRef.current);
    };
  }, [load, pollMs]);

  const refresh = useCallback(() => {
    invalidateLiveStatusCache();
    void load(true);
  }, [load]);

  /**
   * Get the tier for a specific device id — "full" | "bridge" | "offline"
   */
  const getTier = useCallback((deviceId: string): "full" | "bridge" | "offline" | "checking" => {
    if (checking && statuses.length === 0) return "checking";
    return statuses.find(s => s.id === deviceId)?.connection_tier ?? "offline";
  }, [statuses, checking]);

  /**
   * Is a specific device fully connected (FK623 + bridge + WireGuard)?
   */
  const isConnected = useCallback((deviceId: string): boolean => {
    if (checking && statuses.length === 0) return false;
    return statuses.find(s => s.id === deviceId)?.connected ?? false;
  }, [statuses, checking]);

  return { statuses, loading, checking, refresh, getTier, isConnected };
}

/**
 * Utility: map a LiveDeviceStatus tier to Tailwind dot classes.
 * Consistent across all pages.
 */
export function tierDotClass(tier: "full" | "bridge" | "offline" | "checking"): string {
  if (tier === "full")     return "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)] animate-pulse";
  if (tier === "bridge")   return "bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.4)] animate-pulse";
  if (tier === "checking") return "bg-blue-400 animate-pulse";
  return "bg-gray-300";
}

/**
 * Utility: map a tier to a human-readable label.
 */
export function tierLabel(tier: "full" | "bridge" | "offline" | "checking"): string {
  if (tier === "full")     return "Connected";
  if (tier === "bridge")   return "Bridge only";
  if (tier === "checking") return "Checking…";
  return "Offline";
}

/**
 * Utility: map a tier to text color class.
 */
export function tierTextClass(tier: "full" | "bridge" | "offline" | "checking"): string {
  if (tier === "full")     return "text-green-600";
  if (tier === "bridge")   return "text-yellow-600";
  if (tier === "checking") return "text-blue-500";
  return "text-muted-foreground";
}
