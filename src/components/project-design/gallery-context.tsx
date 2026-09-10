"use client";
import { createContext, use, type CSSProperties } from "react";
import { defaultSettings, type DesignSettings } from "@/lib/project-design/model";
export const GalleryContext = createContext<{
  settings: DesignSettings;
  mode: "light" | "dark";
  style: CSSProperties;
}>({ settings: defaultSettings, mode: "light", style: {} });
export function useGallery() {
  return use(GalleryContext);
}
