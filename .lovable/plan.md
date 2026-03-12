

## Plan: Beacon + Captain Trigger Page Upgrades (with Pilot Captain Attribution)

### Database Migration

```sql
-- 1. council_members table for pilot captain roster
CREATE TABLE public.council_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.council_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Council members readable by everyone"
  ON public.council_members FOR SELECT TO public USING (true);

-- 2. New columns on court_status
ALTER TABLE public.court_status
  ADD COLUMN IF NOT EXISTS help_needed text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS report_to text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS captain_name text DEFAULT NULL;

-- 3. Make match_time nullable
ALTER TABLE public.matches
  ALTER COLUMN match_time DROP NOT NULL;
```

`council_members` is read-only from the client (no insert/update/delete policies). Seed captain names via the data insert tool after migration. `captain_name` on `court_status` stores the selected display name directly — no join needed on the Beacon page.

---

### Captain Trigger Page (`src/pages/CaptainDashboard.tsx`)

**Captain name selector** — fetch `council_members` via react-query. Replace the current `captainName` localStorage default with a dropdown (`Select` component) populated from the query. Store selection in local state + localStorage for persistence. Include the selected `captain_name` in the `court_status` insert payload alongside existing `created_by`.

**Help Needed section** — new section after effort tags, visually separated:
- Three mutually exclusive radio-style chips: "We've got it — no help needed" (`none`), "Extra hands welcome — bring towels" (`towels`), "All hands needed — bring everything" (`all`).
- Read-only Dry-Clock context line beneath (placeholder text for now).
- Optional `Report to:` single-line input with placeholder "e.g. Court 3 entrance · Ask for Sarah".
- Both `help_needed` and `report_to` included in `court_status` insert.

**Match time optional** — change match time input label to "Match time — optional" with sub-label "(Helps opponents know when to leave)". Remove required validation. Insert `null` if empty.

---

### Beacon Page (`src/pages/BeaconPage.tsx`)

**Audience separation** — existing content (hero banner, Home Team Prep card, timeline) remains as the opponent-facing section. After timeline, add a full-width `bg-muted/50` section labeled "Your team needs you" displaying `help_needed` mapped to human-readable text and `report_to` if present.

**Captain attribution** — below the hero banner status text, add: `Updated {h:mma} · by Captain {captain_name}`. Derive time from `latestStatus.created_at`, name from `latestStatus.captain_name`. Falls back to just the time if no captain name. Styled `text-xs text-white/60`.

**Conditional match time** — only render match time line if `match.match_time` is non-null.

**Footer CTA** — at page bottom: "Running your own matches?" / "Get this for your courts →" linking to `/captain`. Styled as `text-sm text-muted-foreground`.

---

### Files Changed
1. **Database migration** — create `council_members`, add 3 columns to `court_status`, make `match_time` nullable
2. **`src/pages/CaptainDashboard.tsx`** — captain name dropdown from `council_members`, Help Needed section, optional match time, report-to field
3. **`src/pages/BeaconPage.tsx`** — audience separation, captain attribution from `captain_name`, teammate section, footer CTA

