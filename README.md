# Aurelius

**Read Marcus Aurelius with intention.**

Aurelius is a focused reader for *Meditations*—built for slow reading, reflection, and return. It is **Marcus-only**: one text, clear structure, and no generic “wisdom feed.”

## What it does today

- **Reader** — Navigate by book and section, search the corpus, switch English translations (Project Gutenberg editions), optional digest mode (short beats), focus mode, and compare translations side by side.
- **Today** — A deterministic daily passage and digest beat (same calendar date → same reading). Opens from the header **Today** control or **Menu → Today’s reading**.
- **Reflection** — One Marcus-specific prompt per day (chosen deterministically) and one private **takeaway** field, stored locally in the browser (`localStorage`), keyed by date.

The **Guided** tab is reserved for structured sessions later; the core ritual is the reader + Today + reflection.

## Product spine

Everything beyond that is **depth, not the loop**: theme indexes, richer history, and line-by-line comparison are layered on only after the daily practice feels solid.

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

Static text lives under `public/` as JSON. Source is TypeScript + Vite; styles in `src/style.css`.

## Positioning (non-goals)

No random quote feeds, no other Stoics “for now,” no social layer, no gamified inner peace. The app stays small, severe, and readable.
