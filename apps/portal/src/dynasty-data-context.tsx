import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  PLACEHOLDER_CONFERENCES,
} from '@ncaa/domain';
import type {
  Dynasty,
  DynastyCheckpoint,
  PlayerCatalogEntry,
  PlayerProgression,
  PostseasonResult,
  RankingSnapshot,
  Roster,
  Team,
  TeamTenure,
} from '@ncaa/domain';
import { fetchDynastyBundle, type DynastyBundle } from './api';

interface DynastyDataContextValue {
  bundle: DynastyBundle | null;
  loading: boolean;
  refresh: () => Promise<void>;
  dynasty: Dynasty;
  teams: Team[];
  rosters: Record<string, Roster>;
  progression: PlayerProgression[];
  checkpoints: DynastyCheckpoint[];
  playerCatalog: PlayerCatalogEntry[];
  postseasonResults: PostseasonResult[];
  teamTenures: TeamTenure[];
  conferences: typeof PLACEHOLDER_CONFERENCES;
}

const DynastyDataContext = createContext<DynastyDataContextValue | null>(null);

function emptyDynasty(dynastyId: string): Dynasty {
  const now = new Date().toISOString();
  const currentSeasonYear = new Date().getFullYear();
  return {
    id: dynastyId,
    name: 'Hosted dynasty unavailable',
    currentSeasonYear,
    seasons: [],
    rankings: [],
    recruitingClasses: [],
    teamRosterSnapshots: [],
    checkpoints: [],
    playerCatalog: [],
    postseasonResults: [],
    createdAt: now,
    updatedAt: now,
  };
}

function cacheKey(dynastyId: string): string {
  return `ncaa:last-hosted-dynasty:${dynastyId}`;
}

function readCachedBundle(dynastyId: string): DynastyBundle | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(dynastyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DynastyBundle;
    return hasHostedData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedBundle(dynastyId: string, bundle: DynastyBundle): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(dynastyId), JSON.stringify(bundle));
  } catch {
    // Cache is best-effort; the live hosted response remains authoritative.
  }
}

function clearCachedBundle(dynastyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(cacheKey(dynastyId));
  } catch {
    // Cache cleanup is best-effort; the live hosted response remains authoritative.
  }
}

function hasHostedData(bundle: DynastyBundle): boolean {
  return (
    bundle.syncBatches.length > 0 ||
    bundle.importState !== null ||
    (bundle.dynasty.rankings?.length ?? 0) > 0 ||
    (bundle.rankings?.length ?? 0) > 0
  );
}

function mergeRankings(...rankingLists: Array<RankingSnapshot[] | undefined>): RankingSnapshot[] {
  const rankingsById = new Map<string, RankingSnapshot>();
  for (const rankings of rankingLists) {
    for (const ranking of rankings ?? []) {
      rankingsById.set(ranking.id, ranking);
    }
  }
  return Array.from(rankingsById.values());
}

function rankingsFromCheckpoints(checkpoints: DynastyCheckpoint[] | undefined): RankingSnapshot[] {
  return (checkpoints ?? [])
    .filter((checkpoint) => checkpoint.rankingSnapshot)
    .map((checkpoint) => ({
      ...checkpoint.rankingSnapshot!,
      week: checkpoint.rankingSnapshot!.week ?? checkpoint.week,
    }));
}

export function DynastyDataProvider({
  dynastyId,
  children,
}: {
  dynastyId: string;
  children: ReactNode;
}) {
  const [bundle, setBundle] = useState<DynastyBundle | null>(() => readCachedBundle(dynastyId));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextBundle = await fetchDynastyBundle(dynastyId);
      setBundle(() => {
        if (!hasHostedData(nextBundle)) {
          clearCachedBundle(dynastyId);
          return null;
        }
        if (hasHostedData(nextBundle)) writeCachedBundle(dynastyId, nextBundle);
        return nextBundle;
      });
    } catch {
      setBundle((current) => current ?? readCachedBundle(dynastyId));
    } finally {
      setLoading(false);
    }
  }, [dynastyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<DynastyDataContextValue>(
    () => {
      const checkpoints = bundle?.checkpoints ?? bundle?.dynasty.checkpoints ?? [];
      const rankings = mergeRankings(
        bundle?.dynasty.rankings,
        bundle?.rankings,
        rankingsFromCheckpoints(checkpoints)
      );
      const dynasty = bundle?.dynasty
        ? {
            ...bundle.dynasty,
            rankings,
          }
        : emptyDynasty(dynastyId);

      return {
        bundle,
        loading,
        refresh,
        dynasty,
        teams: bundle?.teams ?? [],
        rosters: bundle?.rosters ?? {},
        progression: bundle?.progression ?? [],
        checkpoints,
        playerCatalog: bundle?.playerCatalog ?? bundle?.dynasty.playerCatalog ?? [],
        postseasonResults: bundle?.postseasonResults ?? bundle?.dynasty.postseasonResults ?? [],
        teamTenures: bundle?.teamTenures ?? [],
        conferences: PLACEHOLDER_CONFERENCES,
      };
    },
    [bundle, dynastyId, loading, refresh]
  );

  return <DynastyDataContext.Provider value={value}>{children}</DynastyDataContext.Provider>;
}

export function useDynastyData() {
  const ctx = useContext(DynastyDataContext);
  if (!ctx) throw new Error('useDynastyData must be used within DynastyDataProvider');
  return ctx;
}
