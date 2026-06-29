import 'dotenv/config';
import { geocodePatient, geocodePractitioner } from './geocoding.worker';
import { query, queryOne } from '../config/database';

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

describe('geocoding.worker', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  const mockCoords = { lat: 38.8977, lng: -77.0365 };

  const mockGeocodeSuccess = () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: {
              location: mockCoords,
            },
          },
        ],
      }),
    });
  };

  const mockGeocodeFailure = () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        status: 'ZERO_RESULTS',
        results: [],
      }),
    });
  };

  describe('geocodePatient', () => {
    const mockReferralId = 'ref-123';
    const mockPatientId = 'pat-456';
    const mockAddress = '1600 Pennsylvania Ave NW, Washington, DC';

    it('should do nothing if address geocoding fails', async () => {
      mockGeocodeFailure();

      await geocodePatient(mockReferralId, mockAddress);

      expect(query).not.toHaveBeenCalled();
    });

    it('should do nothing if referral is not found', async () => {
      mockGeocodeSuccess();
      (query as jest.Mock).mockResolvedValueOnce([]); // No referral returned

      await geocodePatient(mockReferralId, mockAddress);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT patient_id FROM referrals'),
        [mockReferralId]
      );
      expect(query).toHaveBeenCalledTimes(1); // Only the select query
    });

    it('should update location using ST_SetSRID if PostGIS exists', async () => {
      mockGeocodeSuccess();
      (query as jest.Mock).mockResolvedValueOnce([{ patient_id: mockPatientId }]); // Referral found
      (queryOne as jest.Mock).mockResolvedValueOnce({ exists: true }); // PostGIS exists

      await geocodePatient(mockReferralId, mockAddress);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ST_SetSRID(ST_MakePoint'),
        [mockCoords.lng, mockCoords.lat, mockPatientId]
      );
    });

    it('should update location using text fallback if PostGIS does not exist', async () => {
      mockGeocodeSuccess();
      (query as jest.Mock).mockResolvedValueOnce([{ patient_id: mockPatientId }]); // Referral found
      (queryOne as jest.Mock).mockResolvedValueOnce({ exists: false }); // PostGIS does not exist

      await geocodePatient(mockReferralId, mockAddress);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE patients'),
        [`POINT(${mockCoords.lng} ${mockCoords.lat})`, mockPatientId]
      );
    });
  });

  describe('geocodePractitioner', () => {
    const mockPractitionerId = 'prac-123';
    const mockAddress = '123 Chiropractic Way, CA';

    it('should do nothing if geocoding fails', async () => {
      mockGeocodeFailure();

      await geocodePractitioner(mockPractitionerId, mockAddress);

      expect(query).not.toHaveBeenCalled();
    });

    it('should update location using ST_SetSRID if PostGIS exists', async () => {
      mockGeocodeSuccess();
      (queryOne as jest.Mock).mockResolvedValueOnce({ exists: true }); // PostGIS exists

      await geocodePractitioner(mockPractitionerId, mockAddress);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ST_SetSRID(ST_MakePoint'),
        [mockCoords.lng, mockCoords.lat, mockPractitionerId]
      );
    });

    it('should update location using text fallback if PostGIS does not exist', async () => {
      mockGeocodeSuccess();
      (queryOne as jest.Mock).mockResolvedValueOnce({ exists: false }); // PostGIS does not exist

      await geocodePractitioner(mockPractitionerId, mockAddress);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE practitioner_profiles'),
        [`POINT(${mockCoords.lng} ${mockCoords.lat})`, mockPractitionerId]
      );
    });
  });
});
