"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import { stripLeafletAttributionFromContainer } from "@/lib/leafletStripAttribution";

const OSM_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

type ChatLeafletMapProps = {
  lat: number;
  lng: number;
  className?: string;
  zoom?: number;
};

export function ChatLeafletMap({ lat, lng, className, zoom = 16 }: ChatLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let ro: ResizeObserver | null = null;
    const el = containerRef.current;
    if (!el) return undefined;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(OSM_TILE, {
        attribution: "",
        maxZoom: 19,
      }).addTo(map);

      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "chat-loc-marker-wrap",
          html: '<div class="chat-loc-marker-dot" aria-hidden="true"></div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);

      map.whenReady(() => {
        stripLeafletAttributionFromContainer(map!.getContainer());
      });

      requestAnimationFrame(() => {
        map?.invalidateSize();
      });

      ro = new ResizeObserver(() => {
        map?.invalidateSize();
      });
      ro.observe(el);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      map?.remove();
      map = null;
    };
  }, [lat, lng, zoom]);

  return <div ref={containerRef} className={className ?? "relative h-full min-h-[120px] w-full"} />;
}
