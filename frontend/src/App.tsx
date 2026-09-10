import { useState, useCallback } from 'react';
import { SearchPanel } from './components/SearchPanel';
import { MapView } from './components/MapView';
import { DetailPanel } from './components/DetailPanel';
import { TableView } from './components/TableView';
import { searchCompanies } from './api';
import type { QueryResult, QueryResponse } from './types';

export default function App() {
  const [results, setResults] = useState<QueryResult[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [selected, setSelected] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(
    async (params: { location?: string; lat?: number; lng?: number; radius: number }) => {
      setLoading(true);
      setError(null);
      setSelected(null);

      try {
        const response: QueryResponse = await searchCompanies({
          ...params,
          radius_miles: params.radius,
        });
        setResults(response.companies);
        setCenter(response.center);
        setRadius(response.radius_miles);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      handleSearch({ lat, lng, radius });
    },
    [handleSearch, radius],
  );

  return (
    <div className={`app ${selected ? '' : 'no-detail'}`}>
      <div className="map-container">
        <SearchPanel
          onSearch={handleSearch}
          resultCount={results.length}
          loading={loading}
          error={error}
        />

        <MapView
          results={results}
          center={center}
          radiusMiles={radius}
          selected={selected}
          onSelect={setSelected}
          onMapClick={handleMapClick}
        />
        {loading && <div className="loading-overlay">Searching...</div>}
      </div>

      {selected && (
        <DetailPanel result={selected} onClose={() => setSelected(null)} />
      )}

      <TableView
        results={results}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
