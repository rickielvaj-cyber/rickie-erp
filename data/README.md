# KB seed data

This folder holds `kb_seed_phase2.json`, the one-time seed data for the
Knowledge Base module (`scripts/seed-kb.ts`). It's **gitignored on purpose**
— this repo is public, and the content is proprietary ERP documentation, not
code.

Place your file here before running the seed script:

```
data/kb_seed_phase2.json
```

## Expected format

```json
{
  "entries": [
    {
      "module": "fondasi-erp",
      "title": "...",
      "content": "..."
    }
  ]
}
```

`module` must be one of the slugs in `lib/kb/modules.ts` (`KB_MODULES`) —
the seed script validates every entry against that list before inserting
anything, so a typo fails fast instead of partially seeding.
