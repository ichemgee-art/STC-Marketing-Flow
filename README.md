# STC Marketing Flow

A simple, Egyptian-Arabic task and approval workspace for STC's marketing team.

## What the team sees

- **Nardine:** a clean board with separate name tabs for Gerges, Esraa, and Fatma, plus a prominent waiting-for-review button.
- **Team members:** only their assigned tasks, with large, clear cards and color-coded progress.
- **Workflow:** Assigned → Started → Submitted for review → Nardine approves (green) or requests changes.
- **Notes:** a single optional note field. No mandatory submission or review text.
- **Manager options:** change assignment, title, details, due date, or remove a task from all active lists while retaining an audit event.
- **Notifications:** in-app realtime notifications plus immediate confirmation messages.
- **Cache:** browser-tab-per-account sessions and user-specific selected team tabs. Data refreshes from Supabase, with a short-lived in-memory cache.
- **Language:** Egyptian Arabic, RTL, Cairo font.
- **Archived Excel:** deliberately not part of the current interface. The prior 317 imported archive rows and their batch metadata were deleted from the production database at the user's request; the original XLSX stored in private Supabase Storage still needs separate deletion using the Storage API/dashboard. Never tell users it was physically deleted until its object is confirmed absent.

## Deploy

Production branch: `main`. Next.js 16 / React 19 / Node 24.

Set the following public variables in Vercel for Production and Preview:

```env
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
```

Use the values from the connected Supabase project. Do not commit service-role or secret keys.

Vercel's Git integration automatically builds new commits pushed to `main`.

Production URL supplied by the owner: https://stc-marketing-flow-mauve.vercel.app/

## Safeguards

Supabase RLS restricts members to their own live tasks and notifications. The manager can view the team. Server-side task triggers validate transitions, audit changes, and enqueue manager/employee notifications. Removal is a soft-delete to keep an audit trail. User sessions are independent between browser tabs.

For development: `pnpm install`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`.

## Release notes — 24 November 2026

- New interface in `src/components/simple-workspace.tsx` and `simple-workspace.css`
- Compact team tabs, highly visible review queue, color-coded cards, simplified task dialog
- Optional notes validated in live database migration `stc_optional_submission_review_notes`
- Archived 317 database rows and source batch removed after checking there were no linked active tasks
- The private workbook object remains in Supabase Storage until explicitly deleted through its Storage API/dashboard
