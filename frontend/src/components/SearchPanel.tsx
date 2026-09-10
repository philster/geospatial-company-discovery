import { useState } from 'react';

interface Props {
  onSearch: (params: {
    location?: string;
    lat?: number;
    lng?: number;
    radius: number;
  }) => void;
  resultCount: number;
  loading: boolean;
  error: string | null;
}

export function SearchPanel({ onSearch, resultCount, loading, error }: Props) {
  const [location, setLocation] = useState('San Francisco, CA');
  const [radius, setRadius] = useState('5');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseFloat(radius);
    if (isNaN(r) || r <= 0) return;
    onSearch({ location, radius: r });
  };

  return (
    <div className="search-panel">
      <h1>Company Discovery</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor="location">Location</label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Address or place name"
        />

        <label htmlFor="radius">Radius (miles)</label>
        <select
          id="radius"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>

        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <p className="hint">Or click the map to search from a point</p>

      {error && <p className="error">{error}</p>}

      {resultCount > 0 && (
        <div className="stats">
          {resultCount} {resultCount === 1 ? 'company' : 'companies'} found
        </div>
      )}
    </div>
  );
}
