import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getApiError } from '@/lib/utils';
import AdminShell from '@/components/AdminShell';
import { Loader2 } from 'lucide-react';

const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23e2e8f0'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%2394a3b8'/%3E%3Cellipse cx='20' cy='35' rx='13' ry='9' fill='%2394a3b8'/%3E%3C/svg%3E`;

interface MatchingPractitioner {
  practitioner_id: string;
  name: string;
  email: string;
  photo_url?: string | null;
  matching_score: number;
}

export default function MatchesPage() {
  const { referralId } = useParams<{ referralId: string }>();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchingPractitioner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      if (!referralId) return;
      try {
        const { data } = await api.get<{ data: MatchingPractitioner[] }>(`/admin/referrals/available/${referralId}/matches`);
        console.log('Fetched matches:', data); // Debug: inspect matching scores
        setMatches(data.data);
      } catch (err) {
        toast.error(getApiError(err));
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [referralId]);

  return (
    <AdminShell>
          <div className="row toprow pt-4">
            <div className="col-md-12 d-flex justify-content-between align-items-center">
              <div className="page-title">
                <h1 className="mb-0">Matching Practitioners</h1>
                <p className="mb-0">Practitioners that match this referral.</p>
              </div>
              <button
                type="button"
                className="btn btn-link text-primary fw-semibold"
                onClick={() => navigate('/admin', { state: { tab: 'referrals' } })}
                style={{ fontSize: '1rem' }}
              >
                ← Back to Referrals
              </button>
            </div>
          </div>

      <div className="carddesign">
        <div className="cardbody">
          {loading ? (
            <div className="text-center py-5 text-secondary">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
              <p className="text-sm">Loading matches...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-5 text-secondary">
              <p>No matching practitioners found for this referral.</p>
              <button className="btn btn-info" onClick={() => navigate('/admin', { state: { tab: 'referrals' } })}>
                Back to Referrals
              </button>
            </div>
          ) : (
            <div className="table-responsive" style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
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
                    <tr key={m.practitioner_id} className="align-middle" style={{ transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td>
                        <img
                          src={m.photo_url || DEFAULT_AVATAR}
                          alt={m.name}
                          className="rounded-circle"
                          style={{ width: '40px', height: '40px', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = DEFAULT_AVATAR;
                          }}
                        />
                      </td>
                      <td className="fw-medium text-dark">{m.name}</td>
                      <td className="text-muted small">{m.email}</td>
                      <td className="text-primary fw-bold">{m.matching_score?.toFixed(2) ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
