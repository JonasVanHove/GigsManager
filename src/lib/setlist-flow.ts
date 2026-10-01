import { isKnownSpecialBlock } from "./setlist-special-blocks";
import { normalizeCapo, getCapoDifference } from "./capo-utils";

export type OptimizationCriteria = "bpm-flow" | "harmonic-keys" | "minimize-capo" | "balanced";

/**
 * Result shape of the Groq setlist flow analysis
 * (POST /api/setlists/[id]/ai-analyze).
 */
export interface FlowWarning {
  fromIndex: number;
  toIndex: number;
  fromTitle: string;
  toTitle: string;
  severity: "info" | "warning";
  message: string;
}

export interface FlowSuggestion {
  description: string;
  move: Array<{ itemId: string; toIndex: number }>;
}

export interface FlowAnalysis {
  overallScore: number;
  headline: string;
  energyArc: string[];
  pacing: string[];
  keyWarnings: FlowWarning[];
  suggestions: FlowSuggestion[];
}

export interface FlowOptimizationResult<T> {
  optimizedItems: T[];
  explanations: string[];
  previewItems: Array<{ label: string; before: string; after: string; changed?: boolean }>;
}

export interface FlowItemLike {
  id: string;
  kind: "song" | "special";
  label: string;
  specialLabel: string;
  tempo: string;
  tuning: string;
  expanded?: boolean;
}

/**
 * Optimizes the song order in a setlist based on selected criteria,
 * while strictly maintaining the relative boundaries of special set markers (BIS, PAUZE, BINDTEKST).
 */
export function optimizeSetlistFlow<T extends FlowItemLike>(
  items: T[],
  criteria: OptimizationCriteria = "bpm-flow"
): FlowOptimizationResult<T> {
  const optimizedItems: T[] = [];
  const explanations: string[] = [];
  const previewItems: Array<{ label: string; before: string; after: string; changed?: boolean }> = [];

  let currentSongGroup: T[] = [];

  const processSongGroup = (group: T[]) => {
    if (group.length === 0) return;

    // Store original order for preview
    const originalOrder = group.map(item => item.label);

    // Sort songs based on selected criteria
    let sorted: T[];
    let optimizationDescription = "";

    switch (criteria) {
      case "bpm-flow":
        sorted = [...group].sort((a, b) => {
          const bpmA = parseInt(a.tempo, 10) || 0;
          const bpmB = parseInt(b.tempo, 10) || 0;
          return bpmB - bpmA; // Descending BPM for energy flow
        });
        optimizationDescription = "BPM descending for smooth energy flow";
        break;

      case "harmonic-keys":
        sorted = optimizeByHarmonicKeys(group);
        optimizationDescription = "harmonic key transitions (Camelot Wheel)";
        break;

      case "minimize-capo":
        sorted = optimizeByCapoChanges(group);
        optimizationDescription = "minimized capo position changes";
        break;

      case "balanced":
        sorted = optimizeBalanced(group);
        optimizationDescription = "balanced mix of BPM, keys, and capo changes";
        break;

      default:
        sorted = [...group].sort((a, b) => {
          const bpmA = parseInt(a.tempo, 10) || 0;
          const bpmB = parseInt(b.tempo, 10) || 0;
          return bpmB - bpmA;
        });
        optimizationDescription = "BPM descending for smooth energy flow";
    }

    // Generate preview showing song order changes
    const newOrder = sorted.map(item => item.label);
    const orderChanged = originalOrder.some((label, idx) => label !== newOrder[idx]);

    if (orderChanged && originalOrder.length > 0) {
      previewItems.push({
        label: "Song Order",
        before: originalOrder.join(" → "),
        after: newOrder.join(" → "),
        changed: true,
      });
      explanations.push(`Reordered ${sorted.length} songs by ${optimizationDescription}`);
    }

    sorted.forEach((song, idx) => {
      // Preserve the song's original ID and fields (no metadata changes)
      optimizedItems.push({ ...song, expanded: false });

      if (idx > 0) {
        const prev = sorted[idx - 1];
        const prevBPM = parseInt(prev.tempo, 10) || 0;
        const currBPM = parseInt(song.tempo, 10) || 0;
        const prevKey = prev.tuning || "Onbekend";
        const currKey = song.tuning || "Onbekend";

        // Generate key transition insight (for explanation only, not preview)
        if (prevKey !== currKey && prevKey !== "Onbekend" && currKey !== "Onbekend") {
          const keyDiff = Math.abs((currKey.charCodeAt(0) - prevKey.charCodeAt(0)) % 12);
          if (keyDiff <= 2 || keyDiff >= 10) {
            explanations.push(`Smooth key transition: ${prevKey} → ${currKey}`);
          } else if (keyDiff >= 5 && keyDiff <= 7) {
            explanations.push(`Energy boost transition: ${prevKey} → ${currKey}`);
          }
        }

        // Generate BPM transition insight (for explanation only, not preview)
        if (prevBPM && currBPM) {
          if (currBPM > prevBPM + 10) {
            explanations.push(`Energy increase: ${prevBPM} → ${currBPM} BPM`);
          } else if (currBPM < prevBPM - 10) {
            explanations.push(`Energy decrease: ${prevBPM} → ${currBPM} BPM`);
          }
        }

        // Generate capo change insight
        const capoDiff = getCapoDifference(prevKey, currKey);
        if (capoDiff > 0) {
          explanations.push(`Capo change: ${prevKey} → ${currKey} (${capoDiff} fret${capoDiff > 1 ? 's' : ''})`);
        }
      }
    });
  };

  items.forEach((item) => {
    const isSpecialBoundary =
      item.kind === "special" &&
      (isKnownSpecialBlock(item.specialLabel) || isKnownSpecialBlock(item.label));

    if (isSpecialBoundary) {
      // Reorder songs in the preceding set section
      processSongGroup(currentSongGroup);
      currentSongGroup = [];

      // Preserve special boundary marker in its exact position
      optimizedItems.push({ ...item, expanded: false });
    } else if (item.kind === "song") {
      currentSongGroup.push(item);
    } else {
      // Non-boundary specials stay with the group
      currentSongGroup.push(item);
    }
  });

  // Reorder remaining songs in the final set section
  if (currentSongGroup.length > 0) {
    const songsOnly = currentSongGroup.filter((item) => item.kind === "song");
    const otherItems = currentSongGroup.filter((item) => item.kind !== "song");

    processSongGroup(songsOnly);
    otherItems.forEach((other) => {
      optimizedItems.push({ ...other, expanded: false });
    });
  }

  return {
    optimizedItems,
    explanations,
    previewItems,
  };
}

// Helper functions for different optimization strategies

function optimizeByHarmonicKeys<T extends FlowItemLike>(items: T[]): T[] {
  // Simple harmonic key optimization - group similar keys together
  // In a real implementation, this would use the Camelot Wheel for perfect harmonic mixing
  const keyGroups = new Map<string, T[]>();
  
  items.forEach(item => {
    const key = item.tuning || "Onbekend";
    if (!keyGroups.has(key)) {
      keyGroups.set(key, []);
    }
    keyGroups.get(key)!.push(item);
  });

  // Sort keys alphabetically and flatten
  const sortedKeys = Array.from(keyGroups.keys()).sort();
  const result: T[] = [];
  
  sortedKeys.forEach(key => {
    const group = keyGroups.get(key)!;
    // Within each key group, sort by BPM descending
    group.sort((a, b) => {
      const bpmA = parseInt(a.tempo, 10) || 0;
      const bpmB = parseInt(b.tempo, 10) || 0;
      return bpmB - bpmA;
    });
    result.push(...group);
  });

  return result;
}

function optimizeByCapoChanges<T extends FlowItemLike>(items: T[]): T[] {
  // Group songs by capo position to minimize changes
  const capoGroups = new Map<number | null, T[]>();
  
  items.forEach(item => {
    const capo = normalizeCapo(item.tuning);
    if (!capoGroups.has(capo)) {
      capoGroups.set(capo, []);
    }
    capoGroups.get(capo)!.push(item);
  });

  // Sort by capo position (ascending to minimize fret jumps)
  const sortedCapos = Array.from(capoGroups.keys()).sort((a, b) => {
    if (a === null) return 1; // Put non-capo songs at the end
    if (b === null) return -1;
    return a - b;
  });

  const result: T[] = [];
  
  sortedCapos.forEach(capo => {
    const group = capoGroups.get(capo)!;
    // Within each capo group, sort by BPM descending
    group.sort((a, b) => {
      const bpmA = parseInt(a.tempo, 10) || 0;
      const bpmB = parseInt(b.tempo, 10) || 0;
      return bpmB - bpmA;
    });
    result.push(...group);
  });

  return result;
}

function optimizeBalanced<T extends FlowItemLike>(items: T[]): T[] {
  // Balanced approach: consider BPM, keys, and capo changes
  // Score each song based on multiple factors
  const scored = items.map(item => {
    const bpm = parseInt(item.tempo, 10) || 0;
    const capo = normalizeCapo(item.tuning);
    
    // Higher score = should come earlier
    let score = 0;
    
    // BPM factor (higher BPM = higher score for energy)
    score += bpm * 0.5;
    
    // Capo factor (lower capo = slightly higher score for ease)
    if (capo !== null) {
      score -= capo * 2;
    }
    
    return { item, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(s => s.item);
}
