import { useState, useMemo } from 'react';
import type { QueryResult } from '../types';

interface Props {
  results: QueryResult[];
  selected: QueryResult | null;
  onSelect: (result: QueryResult) => void;
}

type SortField =
  | 'name'
  | 'category'
  | 'employees'
  | 'address'
  | 'distance'
  | 'confidence';

export function TableView({ results, selected, onSelect }: Props) {
  const [sortField, setSortField] = useState<SortField>('distance');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getEmployeeCount = (r: QueryResult): number | null => {
    const attr = r.attributes.find((a) => a.attribute_type === 'employee_count');
    if (!attr) return null;
    const n = parseInt(attr.attribute_value, 10);
    return isNaN(n) ? null : n;
  };

  const filtered = useMemo(() => {
    if (!filter) return results;
    const lower = filter.toLowerCase();
    return results.filter(
      (r) =>
        r.company.canonical_name.toLowerCase().includes(lower) ||
        (r.company.category || '').toLowerCase().includes(lower) ||
        r.address.address1.toLowerCase().includes(lower) ||
        r.address.city.toLowerCase().includes(lower),
    );
  }, [results, filter]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.company.canonical_name.localeCompare(b.company.canonical_name);
          break;
        case 'category':
          cmp = (a.company.category || '').localeCompare(b.company.category || '');
          break;
        case 'employees': {
          const ea = getEmployeeCount(a);
          const eb = getEmployeeCount(b);
          if (ea === null && eb === null) cmp = 0;
          else if (ea === null) cmp = 1;
          else if (eb === null) cmp = -1;
          else cmp = ea - eb;
          break;
        }
        case 'address':
          cmp = a.address.address1.localeCompare(b.address.address1);
          break;
        case 'distance':
          cmp = a.distance_miles - b.distance_miles;
          break;
        case 'confidence':
          cmp = a.confidence - b.confidence;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [filtered, sortField, sortAsc]);

  const arrow = (field: SortField) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ^' : ' v';
  };

  if (results.length === 0) return null;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr className="filter-row">
            <td colSpan={7}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter companies..."
              />
            </td>
          </tr>
          <tr>
            <th onClick={() => handleSort('name')}>
              Company<span className="sort-arrow">{arrow('name')}</span>
            </th>
            <th onClick={() => handleSort('category')}>
              Category<span className="sort-arrow">{arrow('category')}</span>
            </th>
            <th onClick={() => handleSort('employees')}>
              Employees<span className="sort-arrow">{arrow('employees')}</span>
            </th>
            <th onClick={() => handleSort('address')}>
              Address<span className="sort-arrow">{arrow('address')}</span>
            </th>
            <th onClick={() => handleSort('distance')}>
              Distance<span className="sort-arrow">{arrow('distance')}</span>
            </th>
            <th onClick={() => handleSort('confidence')}>
              Confidence<span className="sort-arrow">{arrow('confidence')}</span>
            </th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const emp = getEmployeeCount(r);
            return (
              <tr
                key={`${r.company.id}-${r.address.id}`}
                className={
                  selected?.company.id === r.company.id ? 'selected' : ''
                }
                onClick={() => onSelect(r)}
              >
                <td title={r.company.canonical_name}>
                  {r.company.canonical_name}
                </td>
                <td>{r.company.category || '-'}</td>
                <td>{emp !== null ? emp.toLocaleString() : 'unknown'}</td>
                <td title={r.address.address1}>{r.address.address1}</td>
                <td>{r.distance_miles} mi</td>
                <td>{(r.confidence * 100).toFixed(0)}%</td>
                <td>
                  <span className="source-badge">{r.company.source}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
