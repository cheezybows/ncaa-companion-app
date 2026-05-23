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
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { fetchDynastyBundle, type DynastyBundle } from './api';

interface DynastyDataContextValue {
  bundle: DynastyBundle | null;
  loading: boolean;
  refresh: () => Promise<void>;
  dynasty: typeof PLACEHOLDER_DYNASTY;
  teams: typeof PLACEHOLDER_TEAMS;
  rosters: typeof PLACEHOLDER_ROSTERS;
  progression: typeof PLACEHOLDER_PROGRESSION;
  conferences: typeof PLACEHOLDER_CONFERENCES;
}

const DynastyDataContext = createContext<DynastyDataContextValue | null>(null);

export function DynastyDataProvider({
  dynastyId,
  children,
}: {
  dynastyId: string;
  children: ReactNode;
}) {
  const [bundle, setBundle] = useState<DynastyBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBundle(await fetchDynastyBundle(dynastyId));
    } finally {
      setLoading(false);
    }
  }, [dynastyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<DynastyDataContextValue>(
    () => ({
      bundle,
      loading,
      refresh,
      dynasty: bundle?.dynasty ?? PLACEHOLDER_DYNASTY,
      teams: bundle?.teams ?? PLACEHOLDER_TEAMS,
      rosters: bundle?.rosters ?? PLACEHOLDER_ROSTERS,
      progression: bundle?.progression ?? PLACEHOLDER_PROGRESSION,
      conferences: PLACEHOLDER_CONFERENCES,
    }),
    [bundle, loading, refresh]
  );

  return <DynastyDataContext.Provider value={value}>{children}</DynastyDataContext.Provider>;
}

export function useDynastyData() {
  const ctx = useContext(DynastyDataContext);
  if (!ctx) throw new Error('useDynastyData must be used within DynastyDataProvider');
  return ctx;
}
