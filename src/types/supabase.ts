export interface SubCourtsDatabaseRow {
  id: string;
  facility_id: string;
  court_number: number;
  sun_exposure_rating: number;
  drainage_rating: number;
  permanent_note: string | null;
  hazard_description: string | null;
  created_at: string;
}

export type SubCourtRow = SubCourtsDatabaseRow;

export type SubCourtInsert = Pick<SubCourtsDatabaseRow, "facility_id" | "court_number"> &
  Partial<
    Pick<
      SubCourtsDatabaseRow,
      "sun_exposure_rating" | "drainage_rating" | "permanent_note" | "hazard_description"
    >
  >;
