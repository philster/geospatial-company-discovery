import { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  ZoomControl,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { QueryResult } from '../types';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const MILES_TO_METERS = 1609.34;

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [41, 41],
  className: 'selected-marker',
});

interface Props {
  results: QueryResult[];
  center: { lat: number; lng: number } | null;
  radiusMiles: number;
  selected: QueryResult | null;
  onSelect: (result: QueryResult) => void;
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitRadiusCircle({
  center,
  radiusMiles,
}: {
  center: { lat: number; lng: number } | null;
  radiusMiles: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      const radiusMeters = radiusMiles * MILES_TO_METERS;
      const bounds = L.latLng(center.lat, center.lng).toBounds(radiusMeters * 2);
      map.fitBounds(bounds, { padding: [10, 10] });
    }
  }, [center, radiusMiles, map]);

  return null;
}

export function MapView({
  results,
  center,
  radiusMiles,
  selected,
  onSelect,
  onMapClick,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);

  // Group results by address for clustering
  const grouped = new Map<string, QueryResult[]>();
  for (const r of results) {
    const key = `${r.address.lat},${r.address.lng}`;
    const group = grouped.get(key) || [];
    group.push(r);
    grouped.set(key, group);
  }

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      ref={mapRef}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ZoomControl position="bottomright" />
      <MapClickHandler onClick={onMapClick} />
      <FitRadiusCircle center={center} radiusMiles={radiusMiles} />

      {center && (
        <>
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusMiles * MILES_TO_METERS}
            pathOptions={{
              color: '#4a90d9',
              fillColor: '#4a90d9',
              fillOpacity: 0.08,
              weight: 2,
            }}
          />
          <Marker
            position={[center.lat, center.lng]}
            icon={L.divIcon({
              html: '<div style="width:12px;height:12px;background:#d32f2f;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
              className: '',
            })}
          />
        </>
      )}

      {Array.from(grouped.entries()).map(([key, group]) => {
        const first = group[0];
        const isSelected = selected && group.some((r) => r.company.id === selected.company.id);

        return (
          <Marker
            key={key}
            position={[first.address.lat, first.address.lng]}
            icon={isSelected ? selectedIcon : defaultIcon}
            eventHandlers={{ click: () => onSelect(first) }}
          >
            <Popup>
              <div>
                <strong>{first.address.address1}</strong>
                <br />
                {first.address.city}, {first.address.state} {first.address.zip}
                <br />
                <em>
                  {group.length} {group.length === 1 ? 'company' : 'companies'}
                </em>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'none' }}>
                  {group.map((r) => (
                    <li
                      key={r.company.id}
                      onClick={() => onSelect(r)}
                      style={{
                        fontSize: '12px',
                        color: '#4a90d9',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        marginBottom: '2px',
                      }}
                    >
                      {r.company.canonical_name}
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
