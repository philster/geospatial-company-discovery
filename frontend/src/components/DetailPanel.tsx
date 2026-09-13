import type { QueryResult } from '../types';

interface Props {
  result: QueryResult;
  onClose: () => void;
}

export function DetailPanel({ result, onClose }: Props) {
  const { company, address, distance_miles, confidence, attributes } = result;

  const employeeAttr = attributes.find((a) => a.attribute_type === 'employee_count');
  const revenueAttr = attributes.find((a) => a.attribute_type === 'revenue');
  const descAttr = attributes.find((a) => a.attribute_type === 'description');
  const otherAttrs = attributes.filter(
    (a) =>
      a.attribute_type !== 'employee_count' &&
      a.attribute_type !== 'revenue' &&
      a.attribute_type !== 'description',
  );

  const formatRevenue = (val: string): string => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return val;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num}`;
  };

  return (
    <div className="detail-panel">
      <button className="close-btn" onClick={onClose}>
        x
      </button>

      <h2>{company.canonical_name}</h2>

      {company.aliases && (
        <div className="field">
          <div className="field-label">Also known as</div>
          <div className="field-value">
            {JSON.parse(company.aliases).join(', ')}
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-label">Category</div>
        <div className="field-value">{company.category || 'Unknown'}</div>
      </div>

      <div className="field">
        <div className="field-label">Address</div>
        <div className="field-value">
          {address.address1}
          {address.address2 ? `, ${address.address2}` : ''}
          <br />
          {address.city}, {address.state} {address.zip}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Distance</div>
        <div className="field-value">{distance_miles} miles</div>
      </div>

      {company.website && (
        <div className="field">
          <div className="field-label">Website</div>
          <div className="field-value">
            <a href={company.website} target="_blank" rel="noopener noreferrer">
              {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          </div>
        </div>
      )}

      {result.phone && (
        <div className="field">
          <div className="field-label">Phone</div>
          <div className="field-value">{result.phone}</div>
        </div>
      )}

      <div className="field">
        <div className="field-label">Employee Count</div>
        <div className="field-value">
          {employeeAttr ? (
            <>
              {parseInt(employeeAttr.attribute_value, 10).toLocaleString()}
              <div className="attr-source">
                Source: {employeeAttr.source}
                {employeeAttr.crawled_at &&
                  `, crawled ${new Date(employeeAttr.crawled_at).toLocaleDateString()}`}
              </div>
            </>
          ) : (
            'unknown'
          )}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Revenue</div>
        <div className="field-value">
          {revenueAttr ? (
            <>
              {formatRevenue(revenueAttr.attribute_value)}
              <div className="attr-source">
                Source: {revenueAttr.source}
                {revenueAttr.crawled_at &&
                  `, crawled ${new Date(revenueAttr.crawled_at).toLocaleDateString()}`}
              </div>
            </>
          ) : (
            'unknown'
          )}
        </div>
      </div>

      {descAttr && (
        <div className="field">
          <div className="field-label">Description</div>
          <div className="field-value" style={{ fontSize: '13px' }}>
            {descAttr.attribute_value}
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-label">Source & Confidence</div>
        <div className="field-value">
          <span className="source-badge">{company.source}</span>
          {company.crawled_at &&
            `crawled ${new Date(company.crawled_at).toLocaleDateString()}`}
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span style={{ fontSize: '11px', color: '#888' }}>
            {(confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      {otherAttrs.length > 0 && (
        <div className="attributes">
          <div className="field-label">Additional Attributes</div>
          {otherAttrs.map((attr) => (
            <div className="attr-row" key={attr.id}>
              <span className="attr-type">{attr.attribute_type}</span>
              <span className="attr-value">{attr.attribute_value}</span>
              <span className="attr-source">{attr.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
