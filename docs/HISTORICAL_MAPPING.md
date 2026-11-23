# Historical preservation and mapping

Source: `STC Calendar.xlsx`, SHA-256 `ca89dbd42d705b53abd5a56a30b2a5a804e5ffe28a8d38f76234db73e5751a78`.

| Original tab | Rows with data/annotations | Source dimensions | Suggested interpretation |
| --- | ---: | --- | --- |
| Tasks | 127 | 1015 × 28 | A owner, B source date, C task, D source status |
| Fatma2 | 47 | 47 × 28 | A date, B task, C process, D notes/status, E comments |
| Girgis | 39 | 990 × 27 | A date, B task, C process/status, D notes |
| Esraa | 55 | 56 × 28 | A date, B task, C process/status |
| Fatma | 49 | 1003 × 26 | A schedule, B content type, C design idea, D TOV, E caption, F reference, G status, H comments; additional ideas/status/caption columns retained |
| Total | **317** | All five tabs retained | Includes headers, partial records and whitespace values |

There are 38 candidate duplicate groups under the conservative owner/date/title fingerprint. These are review candidates, not confirmed duplicates. No rows were merged or discarded. Labels such as Fatma/Fatma2 are suggested owner labels only; they are not automatic account assignments.

## Preserved evidence

The original XLSX is copied byte-for-byte, with a matching SHA-256. This is the authoritative preservation of formatting, blank rows, objects and all workbook features. JSON separately records every nonempty/annotated cell's address, raw value or formula, cached value, data type, number format, comment and hyperlink. Sheet metadata retains original order, dimensions, visibility, merged ranges and frozen panes. Rows containing only formatting remain represented in the original workbook, not as invented business records.

Date parsing accepts explicit day-month-year, day/month/year and ISO dates. Missing years and ambiguous free text are not guessed. A mapped date is separate from the unmodified original value. Only actual merged ranges provide inherited context; unrelated blanks are never forward-filled. Headers remain archived and do not automatically become tasks.

## Source → archive → current work

`source SHA → import batch → sheet + row number → raw cells + mapped hints → recorded decision → new task UUID`.

The archive is immutable to application users. Unique source SHA prevents reimporting the same bytes. Unique batch/sheet/row coordinates prevent duplicate records inside a batch. A transaction rolls back the full import if any record fails. The original file is uploaded before the database transaction; if the transaction fails, it remains preserved and the same import may be retried.

Managers can continue a selected historical row as a new To Do task. An explicit title, active assignee and mapping/duplicate decision are required. The task and provenance link are created atomically. A source row can map only once. Source dates/statuses/notes remain in the archive; old Done never becomes a newly approved task. Related duplicate rows remain independent evidence until the manager records a decision. No guessed identity, date or status overwrites the source.

## Reconciliation

1. Verify original file hash against the manifest.
2. Verify five tab names/order and the per-tab counts above.
3. Verify 317 archived records and no duplicate source coordinates.
4. Compare every raw source cell against extraction, including formulas/links/comments.
5. Inspect all 38 duplicate groups and all `date_issue` records before promotion.
6. Keep historical data out of current productivity totals; only deliberate new tasks enter the new workflow.

Preserved links are data; import does not fetch or execute external URLs. The UI opens only HTTP(S) cell values. Other hyperlink metadata is displayed as text.
