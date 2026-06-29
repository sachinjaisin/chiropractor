import 'dotenv/config';
import { computeQualityScore } from './score.worker';
import { query, queryOne } from '../config/database';

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

describe('score.worker', () => {
  const mockPractitionerId = 'prac-123';
  let dbState: {
    stats: any;
    weights: any;
    warningCount: number;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    dbState = {
      stats: {
        total_visible: 10,
        total_claimed: 5,
        total_completed: 3,
        avg_response_time: 120, // seconds
        avg_patient_rating: 4.0, // stars
      },
      weights: {
        response_time: 0.2,
        claim_rate: 0.2,
        completion_rate: 0.3,
        patient_rating: 0.3,
      },
      warningCount: 0,
    };

    (queryOne as jest.Mock).mockImplementation(async (sql: string, _params?: any[]) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (cleaned.includes('AVG(f.rating_overall)')) {
        return dbState.stats;
      }
      if (cleaned.includes("key = 'quality.score_weights'")) {
        return { value: JSON.stringify(dbState.weights) };
      }
      if (cleaned.includes('FROM practitioners WHERE id = $1')) {
        return { warning_count: dbState.warningCount };
      }
      return null;
    });

    (query as jest.Mock).mockResolvedValue([]);
  });

  it('should calculate correct composite score without warnings', async () => {
    await computeQualityScore(mockPractitionerId);

    // Expected calculation:
    // claimRate = 5 / 10 = 0.5
    // completionRate = 3 / 5 = 0.6
    // responseScore = 1 - (120 - 30) / 570 = 0.8421
    // ratingScore = (4.0 - 1) / 4 = 0.75
    // composite = (0.2 * 0.8421 + 0.2 * 0.5 + 0.3 * 0.6 + 0.3 * 0.75) * 100 = 67.34
    // warning penalty = 0
    // final composite = 67.34

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE practitioners SET quality_score = $1 WHERE id = $2'),
      [expect.closeTo(67.34, 1), mockPractitionerId]
    );
  });

  it('should apply 10 points penalty per warning', async () => {
    dbState.warningCount = 2; // 2 warnings -> 20 points penalty

    await computeQualityScore(mockPractitionerId);

    // Expected composite: 67.34 - 20 = 47.34
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE practitioners SET quality_score = $1 WHERE id = $2'),
      [expect.closeTo(47.34, 1), mockPractitionerId]
    );
  });

  it('should cap final composite score at 0', async () => {
    dbState.warningCount = 10; // 10 warnings -> 100 points penalty (exceeds 67.34)

    await computeQualityScore(mockPractitionerId);

    // Expected composite: max(0, 67.34 - 100) = 0
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE practitioners SET quality_score = $1 WHERE id = $2'),
      [0, mockPractitionerId]
    );
  });
});
