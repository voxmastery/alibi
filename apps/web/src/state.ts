import type { ModeInfo } from "@alibi/contracts";
import type { RendererChoice } from "./renderer.js";

export type Cleanup = () => void;
export interface AppContext {
  mode: ModeInfo;
  renderer: RendererChoice;
  navigate(path: string): void;
  setTitle(title: string): void;
}
export type Screen = (root: HTMLElement, params: Record<string, string>, ctx: AppContext) => Promise<void | Cleanup> | void | Cleanup;
