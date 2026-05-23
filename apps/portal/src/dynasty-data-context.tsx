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
  PLACEHOLDER_DYNASTY,
} from '@ncaa/domain';
import type { Dynasty, DynastyCheckpoint, PlayerCatalogEntry, PlayerProgression, PostseasonResult, Roster, Team } from '@ncaa/domain';
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
  conferences: typeof PLACEHOLDER_CONFERENCES;
}

const DynastyDataContext = createContext<DynastyDataContextValue | null>(null);

function emptyDynasty(dynastyId: string): Dynasty {
  return {
    ...PLACEHOLDER_DYNASTY,
    id: dynastyId,
    name: 'Hosted dynasty unavailable',
    seasons: [],
    rankings: [],
    recruitingClasses: [],
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

function hasHostedData(bundle: DynastyBundle): boolean {
  return (
    bundle.syncBatches.length > 0 ||
    bundle.importState !== null ||
    (bundle.dynasty.rankings?.length ?? 0) > 0 ||
    (bundle.rankings?.length ?? 0) > 0
  );
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
      setBundle((current) => {
        if (!hasHostedData(nextBundle) && current && hasHostedData(current)) {
          return current;
        }
        if (!hasHostedData(nextBundle)) {
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
      const dynasty = bundle?.dynasty
        ? {
            ...bundle.dynasty,
            rankings: bundle.dynasty.rankings ?? bundle.rankings ?? [],
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
        checkpoints: bundle?.checkpoints ?? bundle?.dynasty.checkpoints ?? [],
        playerCatalog: bundle?.playerCatalog ?? bundle?.dynasty.playerCatalog ?? [],
        postseasonResults: bundle?.postseasonResults ?? bundle?.dynasty.postseasonResults ?? [],
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
