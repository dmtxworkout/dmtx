import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_UNITS,
  type DistanceUnit,
  type Units,
  type WeightUnit,
} from './units';

/**
 * Device-local unit preference (weight kg/lb, distance km/mi), persisted with
 * SecureStore. Display-only — the API keeps kg/meters. Could later move to the
 * server profile for cross-device sync.
 */
const STORAGE_KEY = 'dmtx.units';

interface UnitsContextValue {
  units: Units;
  setWeight: (u: WeightUnit) => void;
  setDistance: (u: DistanceUnit) => void;
}

const UnitsContext = createContext<UnitsContextValue>({
  units: DEFAULT_UNITS,
  setWeight: () => {},
  setDistance: () => {},
});

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);

  // Load the saved preference once (async → allowed to setState here).
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const p = JSON.parse(raw) as Partial<Units>;
        setUnits((u) => ({
          weight: p.weight === 'kg' || p.weight === 'lb' ? p.weight : u.weight,
          distance: p.distance === 'km' || p.distance === 'mi' ? p.distance : u.distance,
        }));
      } catch {
        // ignore malformed storage
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = (next: Units) => {
    setUnits(next);
    void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <UnitsContext.Provider
      value={{
        units,
        setWeight: (w) => persist({ ...units, weight: w }),
        setDistance: (d) => persist({ ...units, distance: d }),
      }}
    >
      {children}
    </UnitsContext.Provider>
  );
}

export const useUnits = () => useContext(UnitsContext);
