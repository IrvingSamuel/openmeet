"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  DEFAULT_SYSTEM_UI,
  type SystemUiTheme,
} from "@/lib/system-ui";

const PlatformBrandContext = createContext<SystemUiTheme>(DEFAULT_SYSTEM_UI);

export function PlatformBrandProvider({
  theme,
  children,
}: {
  theme: SystemUiTheme;
  children: ReactNode;
}) {
  return (
    <PlatformBrandContext.Provider value={theme}>
      {children}
    </PlatformBrandContext.Provider>
  );
}

export function usePlatformBrand(): SystemUiTheme {
  return useContext(PlatformBrandContext);
}
