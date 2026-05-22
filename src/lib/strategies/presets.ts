import presetsData from "./presets.json";
import type { StrategyKind, StrategyParams } from "./types";

export interface StrategyPreset {
  name: string;
  kind: StrategyKind;
  params: StrategyParams;
  cooldownSec: number;
  description: string;
}

export const STRATEGY_PRESETS: StrategyPreset[] = presetsData as StrategyPreset[];
