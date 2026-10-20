// Live EPA, estimated. The nightly nflverse job bakes an expected-points table
// (down x distance bucket x yards-to-go) from nflfastR's own EP; live EPA is EP(after) - EP(before).

export interface EpTable {
  version: number;
  built: string;
  seasons: number[];
  distBuckets: number[]; // lower bounds, e.g. [1,2,...,10,11,16,21]
  // ep[down-1][distBucketIdx][ytg-1]
  ep: number[][][];
  calibration?: { teamGameMae: number | null; playMae: number | null; games: number; plays: number; corr: number | null };
}

export interface EpaInput {
  down: number;
  distance: number;
  ytg: number;
  offenseId: string;
  endTeamId: string;
  endDown: number;
  endDistance: number;
  endYtg: number;
  turnover: boolean;
}

function bucket(t: EpTable, distance: number): number {
  let i = 0;
  for (let k = 0; k < t.distBuckets.length; k++) if (distance >= t.distBuckets[k]) i = k;
  return i;
}

export function epOf(t: EpTable, down: number, distance: number, ytg: number): number {
  const d = Math.min(4, Math.max(1, down)) - 1;
  const y = Math.min(99, Math.max(1, Math.round(ytg))) - 1;
  return t.ep[d][bucket(t, Math.max(1, distance))][y];
}

// Scrimmage plays only (field goals are special teams). Points follow nflfastR: TD = 7, safety = -2 for the offense.
export function estimateEpa(t: EpTable, p: EpaInput, offPts: number, defPts: number): number | null {
  if (!p.down || p.ytg <= 0) return null;
  const before = epOf(t, p.down, p.distance, p.ytg);
  if (offPts >= 6) return 7 - before;
  if (defPts >= 6) return -7 - before;
  if (defPts === 2) return -2 - before;
  if (p.endTeamId !== p.offenseId) {
    if (p.endYtg <= 0 || p.endYtg >= 100) return null;
    return -epOf(t, p.endDown || 1, p.endDistance || 10, p.endYtg) - before;
  }
  if (!p.endDown || p.endYtg <= 0 || p.endYtg >= 100) return null;
  return epOf(t, p.endDown, p.endDistance, p.endYtg) - before;
}
