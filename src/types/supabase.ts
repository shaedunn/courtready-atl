import type { Tables } from "@/integrations/supabase/types";

export type SubCourtRow = Omit<Tables<"sub_courts">, "court_id"> & {
  facility_id: string;
  hazard_description: string | null;
};

export type SubCourtInsert = Pick<SubCourtRow, "facility_id" | "court_number"> &
  Partial<Pick<SubCourtRow, "sun_exposure" | "drainage" | "permanent_note" | "hazard_description">>;
