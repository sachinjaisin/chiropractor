import React from 'react';

interface MatchingPractitioner {
  practitioner_id: string;
  name: string;
  email: string;
  photo_url?: string | null;
  matching_score: number;
}

export default function ReferralMatchesTable({ matches }: { matches: MatchingPractitioner[] }) {
  return (
    <div
      className="table-responsive"
      style={{
        backdropFilter: 'blur(6px)',
        background: 'rgba(255,255,255,0.5)',
        borderRadius: '8px',
        padding: '0.5rem',
      }}
    >
      <table className="table dt-responsive categories_table" style={{ border: 'none' }}>
        <thead>
          <tr className="text-muted">
            <th style={{ minWidth: '70px' }}>Photo</th>
            <th style={{ minWidth: '150px' }}>Name</th>
            <th style={{ minWidth: '200px' }}>Email</th>
            <th style={{ minWidth: '80px' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr
              key={m.practitioner_id}
              className="align-middle"
              style={{ transition: 'background-color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td>
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.name}
                    className="rounded-circle"
                    style={{ width: '30px', height: '30px', objectFit: 'cover', border: '1px solid #fff' }}
                  />
                ) : (
                  <div className="bg-secondary-subtle rounded-circle" style={{ width: '30px', height: '30px' }} />
                )}
              </td>
              <td className="fw-medium text-dark">{m.name}</td>
              <td className="text-muted small">{m.email}</td>
              <td className="text-primary fw-bold">{m.matching_score?.toFixed(2) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
