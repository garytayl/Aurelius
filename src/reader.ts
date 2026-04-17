import type { Corpus, Passage } from "./types";
import { splitDigestBeats } from "./beats";

const STORAGE_ID = "aurelius-passage-id";
const STORAGE_FOCUS = "aurelius-focus";
const STORAGE_DIGEST = "aurelius-digest";
const STORAGE_TRANSLATION = "aurelius-translation";
const STORAGE_THEME = "aurelius-theme";
const STORAGE_STREAK_COUNT = "aurelius-streak-count";
const STORAGE_STREAK_LAST = "aurelius-streak-last";

const TRANSLATIONS: { id: string; file: string }[] = [
  { id: "casaubon", file: "/meditations.json" },
  { id: "long", file: "/meditations-long.json" },
  { id: "chrystal", file: "/meditations-chrystal.json" },
];

const TRANSLATION_LABELS: Record<string, string> = {
  casaubon: "Meric Casaubon (1634)",
  long: "George Long (1862)",
  chrystal: "George W. Chrystal (1902)",
};

function flatText(raw: string): string {
  return raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function passageToHtml(text: string): string {
  const flat = flatText(text);
  const escaped = flat
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/_([^_]+)_/g, "<em>$1</em>");
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (k >= 11 && k <= 13) return `${n}th`;
  if (j === 1) return `${n}st`;
  if (j === 2) return `${n}nd`;
  if (j === 3) return `${n}rd`;
  return `${n}th`;
}

/** Roman numerals for book numbers 1–12 */
const BOOK_ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function previewLine(raw: string, max = 120): string {
  const t = flatText(raw);
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML string: excerpt around first case-insensitive match, with <mark> on the match */
function excerptWithMatchHtml(text: string, query: string): string {
  const flat = flatText(text);
  const q = query.trim();
  if (!q) return escapeHtml(previewLine(text, 120));
  const lower = flat.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) return escapeHtml(previewLine(text, 120));
  const pad = 52;
  const a = Math.max(0, idx - pad);
  const b = Math.min(flat.length, idx + q.length + pad);
  const snippet = flat.slice(a, b);
  const rel = idx - a;
  const before = escapeHtml(snippet.slice(0, rel));
  const midRaw = snippet.slice(rel, rel + q.length);
  const mid = escapeHtml(midRaw);
  const after = escapeHtml(snippet.slice(rel + q.length));
  const prefix = a > 0 ? "…" : "";
  const suffix = b < flat.length ? "…" : "";
  return `${prefix}${before}<mark class="search-hit__mark">${mid}</mark>${after}${suffix}`;
}

export type ReaderController = {
  closeOverlays: () => void;
  goToPassage: (opts: { book: number; section: number; translationId?: string }) => Promise<void>;
};

export function initReader(mount: HTMLElement): ReaderController {
  function readerActive(): boolean {
    return !mount.hidden;
  }

  mount.innerHTML = `
    <div class="shell" data-focus="0" data-digest="0">
      <div class="progress" role="presentation" aria-hidden="true">
        <div class="progress__fill"></div>
      </div>
      <header class="top">
        <div class="top__slot top__slot--start">
          <button type="button" class="icon-btn" id="btn-books" aria-label="Books and sections" aria-haspopup="dialog">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M4 6h16M4 12h10M4 18h16"/>
            </svg>
          </button>
        </div>
        <span class="brand">Meditations</span>
        <div class="top__slot top__slot--end">
          <button type="button" class="icon-btn" id="btn-menu" aria-label="Menu" aria-haspopup="dialog">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        <button type="button" class="icon-btn" id="btn-focus" aria-pressed="false" aria-label="Focus mode">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2"/>
          </svg>
        </button>
        </div>
      </header>
      <main class="stage">
        <button type="button" class="meta meta--jump" id="meta" title="Sections in this book"></button>
        <article class="passage" id="passage-body"></article>
      </main>
      <nav class="dock" aria-label="Navigate passages">
        <button type="button" class="dock-btn" id="btn-prev" aria-label="Previous passage">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <button type="button" class="dock-btn dock-btn--spark" id="btn-rand" aria-label="Random passage">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l1.2 3.6L17 7l-3.8 1.4L12 12l-1.2-3.6L7 7l3.8-1.4L12 2zM5 14l.8 2.4L8 17l-2.2.8L5 20l-.8-2.4L2 17l2.2-.8L5 14zm14 0l.8 2.4L22 17l-2.2.8L19 20l-.8-2.4L16 17l2.2-.8L19 14z"/>
          </svg>
        </button>
        <button type="button" class="dock-btn" id="btn-next" aria-label="Next passage">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </nav>
      <div class="sheet" id="nav-sheet" aria-hidden="true">
        <button type="button" class="sheet__scrim" id="sheet-scrim" aria-label="Close"></button>
        <div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div class="sheet__toolbar">
            <div class="sheet__toolbar-start">
              <button type="button" class="icon-btn sheet__back" id="sheet-back" aria-label="Back to books">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
              </button>
            </div>
            <h2 class="sheet__title" id="sheet-title">Books</h2>
            <div class="sheet__toolbar-end">
              <button type="button" class="icon-btn" id="sheet-close" aria-label="Close">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div class="sheet__body">
            <div class="book-grid" id="sheet-books"></div>
            <div class="section-list-wrap" id="sheet-sections" hidden></div>
          </div>
        </div>
      </div>
      <div class="sheet" id="menu-sheet" aria-hidden="true">
        <button type="button" class="sheet__scrim" id="menu-scrim" aria-label="Close"></button>
        <div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="menu-sheet-title">
          <div class="sheet__toolbar">
            <div class="sheet__toolbar-start">
              <button type="button" class="icon-btn sheet__back" id="menu-back" aria-label="Back">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
              </button>
            </div>
            <h2 class="sheet__title" id="menu-sheet-title">Menu</h2>
            <div class="sheet__toolbar-end">
              <button type="button" class="icon-btn" id="menu-close" aria-label="Close">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div class="sheet__body sheet__body--menu">
            <div class="menu-panels">
              <div class="menu-panel" id="menu-panel-main">
                <div class="menu-translation">
                  <label class="menu-translation__label" for="translation-select">Translation</label>
                  <select id="translation-select" class="menu-translation__select" aria-label="English translation">
                    <option value="casaubon">Meric Casaubon (1634)</option>
                    <option value="long">George Long (1862)</option>
                    <option value="chrystal">George W. Chrystal (1902)</option>
                  </select>
                  <p class="menu-translation__note">Public-domain texts from Project Gutenberg. Section breaks can differ between editions.</p>
                </div>
                <div class="menu-appearance">
                  <label class="menu-translation__label" for="theme-select">Appearance</label>
                  <select id="theme-select" class="menu-translation__select" aria-label="Color theme">
                    <option value="dark">Dark</option>
                    <option value="sepia">Sepia</option>
                    <option value="paper">Paper</option>
                  </select>
                </div>
                <p class="menu-streak" id="menu-streak-line" aria-live="polite"></p>
                <div class="menu-list" role="menu">
                  <button type="button" class="menu-item" id="menu-item-today" role="menuitem">
                    <span class="menu-item__label">Today&apos;s passage</span>
                    <span class="menu-item__hint">Same text each calendar day</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-compare" role="menuitem">
                    <span class="menu-item__label">Compare translations</span>
                    <span class="menu-item__hint">Same book &amp; section, two editions</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-copy" role="menuitem">
                    <span class="menu-item__label">Copy quotation</span>
                    <span class="menu-item__hint">With book, section, translator</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-jump" role="menuitem">
                    <span class="menu-item__label">Jump to passage</span>
                    <span class="menu-item__hint">Book and section number</span>
                  </button>
                  <button type="button" class="menu-item menu-item--toggle" id="menu-item-digest" role="menuitemcheckbox" aria-pressed="false">
                    <span class="menu-item__label">Digest mode</span>
                    <span class="menu-item__hint" id="menu-digest-hint">One short thought at a time — off</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-search" role="menuitem">
                    <span class="menu-item__label">Search</span>
                    <span class="menu-item__hint">Find words in the text</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-keys" role="menuitem">
                    <span class="menu-item__label">Keyboard shortcuts</span>
                    <span class="menu-item__hint">Arrow keys, R, F, B, M, /</span>
                  </button>
                  <button type="button" class="menu-item" id="menu-item-about" role="menuitem">
                    <span class="menu-item__label">About this text</span>
                    <span class="menu-item__hint">Source &amp; edition</span>
                  </button>
                </div>
              </div>
              <div class="menu-panel" id="menu-panel-jump" hidden>
                <form class="jump-form" id="jump-form">
                  <label class="jump-field">
                    <span class="jump-field__label">Book</span>
                    <select class="jump-input" id="jump-book" aria-label="Book number"></select>
                  </label>
                  <label class="jump-field">
                    <span class="jump-field__label">Section</span>
                    <input class="jump-input" id="jump-section" type="number" inputmode="numeric" min="1" step="1" placeholder="e.g. 12" aria-label="Section number" />
                  </label>
                  <p class="jump-error" id="jump-error" role="alert" hidden></p>
                  <button type="submit" class="jump-submit">Go to passage</button>
                </form>
              </div>
              <div class="menu-panel menu-panel--search" id="menu-panel-search" hidden>
                <label class="search-field">
                  <span class="search-field__label">Search</span>
                  <input type="search" class="search-input" id="search-q" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Words from the Meditations" aria-label="Search passages" />
                </label>
                <p class="search-status" id="search-status" aria-live="polite"></p>
                <ul class="search-results" id="search-results"></ul>
              </div>
              <div class="menu-panel menu-panel--prose" id="menu-panel-keys" hidden>
                <dl class="keys-list">
                  <div class="keys-row"><dt>← →</dt><dd>Turn page; digest mode uses one short thought per step</dd></div>
                  <div class="keys-row"><dt>R</dt><dd>Random passage</dd></div>
                  <div class="keys-row"><dt>F</dt><dd>Toggle focus mode</dd></div>
                  <div class="keys-row"><dt>B</dt><dd>Open books navigator</dd></div>
                  <div class="keys-row"><dt>M</dt><dd>Open this menu</dd></div>
                  <div class="keys-row"><dt>/</dt><dd>Open search</dd></div>
                  <div class="keys-row"><dt>URL</dt><dd>Share <code>?t=</code> translation, <code>book=</code>, <code>section=</code> — updates as you read</dd></div>
                  <div class="keys-row"><dt>Esc</dt><dd>Close sheet; in navigation, back to books</dd></div>
                </dl>
              </div>
              <div class="menu-panel menu-panel--prose" id="menu-panel-about" hidden>
                <p class="about-lead">Marcus Aurelius — <em>Meditations</em></p>
                <p class="about-p" id="about-source"></p>
                <p class="about-p" id="about-translator"></p>
                <p class="about-p about-p--mute">Reader is a quiet companion for the text. Swipe the passage to turn pages where supported.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sheet" id="compare-sheet" aria-hidden="true">
        <button type="button" class="sheet__scrim" id="compare-scrim" aria-label="Close"></button>
        <div class="sheet__panel sheet__panel--wide" role="dialog" aria-modal="true" aria-labelledby="compare-sheet-title">
          <div class="sheet__toolbar">
            <div class="sheet__toolbar-start"></div>
            <h2 class="sheet__title" id="compare-sheet-title">Compare</h2>
            <div class="sheet__toolbar-end">
              <button type="button" class="icon-btn" id="compare-close" aria-label="Close">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div class="sheet__body sheet__body--compare">
            <label class="compare-field">
              <span class="compare-field__label">Other edition</span>
              <select id="compare-other-select" class="menu-translation__select" aria-label="Second translation"></select>
            </label>
            <p class="compare-meta" id="compare-meta"></p>
            <div class="compare-grid" id="compare-grid"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const shell = mount.querySelector<HTMLElement>(".shell")!;
  const stage = mount.querySelector<HTMLElement>(".stage")!;
  const meta = mount.querySelector<HTMLButtonElement>("#meta")!;
  const body = mount.querySelector<HTMLElement>("#passage-body")!;
  const fill = mount.querySelector<HTMLElement>(".progress__fill")!;
  const btnPrev = mount.querySelector<HTMLButtonElement>("#btn-prev")!;
  const btnNext = mount.querySelector<HTMLButtonElement>("#btn-next")!;
  const btnRand = mount.querySelector<HTMLButtonElement>("#btn-rand")!;
  const btnFocus = mount.querySelector<HTMLButtonElement>("#btn-focus")!;
  const btnBooks = mount.querySelector<HTMLButtonElement>("#btn-books")!;
  const navSheet = mount.querySelector<HTMLElement>("#nav-sheet")!;
  const sheetScrim = mount.querySelector<HTMLButtonElement>("#sheet-scrim")!;
  const sheetClose = mount.querySelector<HTMLButtonElement>("#sheet-close")!;
  const sheetBack = mount.querySelector<HTMLButtonElement>("#sheet-back")!;
  const sheetTitle = mount.querySelector<HTMLElement>("#sheet-title")!;
  const sheetBooks = mount.querySelector<HTMLElement>("#sheet-books")!;
  const sheetSections = mount.querySelector<HTMLElement>("#sheet-sections")!;
  const menuSheet = mount.querySelector<HTMLElement>("#menu-sheet")!;
  const menuScrim = mount.querySelector<HTMLButtonElement>("#menu-scrim")!;
  const menuClose = mount.querySelector<HTMLButtonElement>("#menu-close")!;
  const menuBack = mount.querySelector<HTMLButtonElement>("#menu-back")!;
  const menuSheetTitle = mount.querySelector<HTMLElement>("#menu-sheet-title")!;
  const menuPanelMain = mount.querySelector<HTMLElement>("#menu-panel-main")!;
  const menuPanelJump = mount.querySelector<HTMLElement>("#menu-panel-jump")!;
  const menuPanelSearch = mount.querySelector<HTMLElement>("#menu-panel-search")!;
  const menuPanelKeys = mount.querySelector<HTMLElement>("#menu-panel-keys")!;
  const menuPanelAbout = mount.querySelector<HTMLElement>("#menu-panel-about")!;
  const menuItemJump = mount.querySelector<HTMLButtonElement>("#menu-item-jump")!;
  const menuItemDigest = mount.querySelector<HTMLButtonElement>("#menu-item-digest")!;
  const menuDigestHint = mount.querySelector<HTMLElement>("#menu-digest-hint")!;
  const menuItemSearch = mount.querySelector<HTMLButtonElement>("#menu-item-search")!;
  const menuItemKeys = mount.querySelector<HTMLButtonElement>("#menu-item-keys")!;
  const menuItemAbout = mount.querySelector<HTMLButtonElement>("#menu-item-about")!;
  const jumpForm = mount.querySelector<HTMLFormElement>("#jump-form")!;
  const jumpBook = mount.querySelector<HTMLSelectElement>("#jump-book")!;
  const jumpSection = mount.querySelector<HTMLInputElement>("#jump-section")!;
  const jumpError = mount.querySelector<HTMLElement>("#jump-error")!;
  const aboutSource = mount.querySelector<HTMLElement>("#about-source")!;
  const aboutTranslator = mount.querySelector<HTMLElement>("#about-translator")!;
  const btnMenu = mount.querySelector<HTMLButtonElement>("#btn-menu")!;
  const searchQ = mount.querySelector<HTMLInputElement>("#search-q")!;
  const searchStatus = mount.querySelector<HTMLElement>("#search-status")!;
  const searchResults = mount.querySelector<HTMLElement>("#search-results")!;
  const translationSelect = mount.querySelector<HTMLSelectElement>("#translation-select")!;
  const themeSelect = mount.querySelector<HTMLSelectElement>("#theme-select")!;
  const menuStreakLine = mount.querySelector<HTMLElement>("#menu-streak-line")!;
  const menuItemToday = mount.querySelector<HTMLButtonElement>("#menu-item-today")!;
  const menuItemCompare = mount.querySelector<HTMLButtonElement>("#menu-item-compare")!;
  const menuItemCopy = mount.querySelector<HTMLButtonElement>("#menu-item-copy")!;
  const compareSheet = mount.querySelector<HTMLElement>("#compare-sheet")!;
  const compareScrim = mount.querySelector<HTMLButtonElement>("#compare-scrim")!;
  const compareClose = mount.querySelector<HTMLButtonElement>("#compare-close")!;
  const compareOtherSelect = mount.querySelector<HTMLSelectElement>("#compare-other-select")!;
  const compareMeta = mount.querySelector<HTMLElement>("#compare-meta")!;
  const compareGrid = mount.querySelector<HTMLElement>("#compare-grid")!;

  const corpusCache = new Map<string, Corpus>();

  function dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dailyPassageIndex(len: number): number {
    if (len <= 0) return 0;
    const key = dateKey(new Date());
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (Math.abs(h) >>> 0) % len;
  }

  function parseUrlPassage(): { translationId: string; book: number; section: number } | null {
    try {
      const q = new URLSearchParams(window.location.search);
      const book = Number(q.get("book"));
      const section = Number(q.get("section"));
      const t = q.get("t");
      if (!Number.isFinite(book) || !Number.isFinite(section) || book < 1 || section < 1) return null;
      if (!t || !TRANSLATIONS.some((x) => x.id === t)) return null;
      return { translationId: t, book, section };
    } catch {
      return null;
    }
  }

  function syncPassageUrl(): void {
    const p = passages[index];
    if (!p || typeof history === "undefined") return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("t", activeTranslationId);
      u.searchParams.set("book", String(p.book));
      u.searchParams.set("section", String(p.section));
      history.replaceState(null, "", u.toString());
    } catch {
      /* ignore */
    }
  }

  function motionOk(): boolean {
    return typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function passageFade(): void {
    if (!motionOk()) return;
    passageFade();
  }

  function updateStreakLine(): void {
    try {
      const today = dateKey(new Date());
      const last = localStorage.getItem(STORAGE_STREAK_LAST);
      let n = Number(localStorage.getItem(STORAGE_STREAK_COUNT) || "0") || 0;

      if (last === today) {
        menuStreakLine.textContent =
          n > 1 ? `${n}-day streak.` : "Open any day to start a streak.";
        return;
      }

      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yKey = dateKey(y);

      if (last === yKey) n += 1;
      else n = 1;

      localStorage.setItem(STORAGE_STREAK_LAST, today);
      localStorage.setItem(STORAGE_STREAK_COUNT, String(n));
      menuStreakLine.textContent = n > 1 ? `${n}-day streak.` : "Streak started — see you tomorrow.";
    } catch {
      menuStreakLine.textContent = "";
    }
  }

  function applyTheme(themeId: string): void {
    const v = themeId === "sepia" || themeId === "paper" ? themeId : "dark";
    document.documentElement.dataset.theme = v;
    themeSelect.value = v;
    try {
      localStorage.setItem(STORAGE_THEME, v);
    } catch {
      /* ignore */
    }
  }

  function loadTheme(): void {
    try {
      const v = localStorage.getItem(STORAGE_THEME);
      if (v === "sepia" || v === "paper" || v === "dark") applyTheme(v);
      else applyTheme("dark");
    } catch {
      applyTheme("dark");
    }
  }

  let passages: Passage[] = [];
  let index = 0;
  /** Index of the short "beat" within the current passage when digest mode is on */
  let beatIndex = 0;
  let corpusMeta = { source: "", translator: "" };

  type MenuMode = "main" | "jump" | "search" | "keys" | "about";
  let menuMode: MenuMode = "main";

  const SEARCH_MAX = 100;
  let searchDebounce: ReturnType<typeof setTimeout> | undefined;

  function loadIndex(): void {
    try {
      const raw = localStorage.getItem(STORAGE_ID);
      if (!raw || passages.length === 0) return;
      const i = passages.findIndex((p) => p.id === raw);
      if (i >= 0) {
        index = i;
        beatIndex = 0;
      }
    } catch {
      /* ignore */
    }
  }

  function saveIndex(): void {
    try {
      localStorage.setItem(STORAGE_ID, passages[index]?.id ?? "");
    } catch {
      /* ignore */
    }
  }

  function getTranslationId(): string {
    try {
      const v = localStorage.getItem(STORAGE_TRANSLATION);
      if (v === "long" || v === "casaubon" || v === "chrystal") return v;
    } catch {
      /* ignore */
    }
    return "casaubon";
  }

  function saveTranslationId(id: string): void {
    try {
      localStorage.setItem(STORAGE_TRANSLATION, id);
    } catch {
      /* ignore */
    }
  }

  let activeTranslationId = getTranslationId();

  function loadFocus(): void {
    try {
      const v = localStorage.getItem(STORAGE_FOCUS);
      if (v === "1") setFocus(true);
    } catch {
      /* ignore */
    }
  }

  function loadDigest(): void {
    try {
      const v = localStorage.getItem(STORAGE_DIGEST);
      shell.dataset.digest = v === "1" ? "1" : "0";
    } catch {
      shell.dataset.digest = "0";
    }
  }

  function saveDigest(on: boolean): void {
    try {
      localStorage.setItem(STORAGE_DIGEST, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function updateDigestMenuHint(): void {
    const on = shell.dataset.digest === "1";
    menuItemDigest.setAttribute("aria-pressed", on ? "true" : "false");
    menuDigestHint.textContent = on
      ? "One short thought at a time — on"
      : "One short thought at a time — off";
  }

  function setDigest(on: boolean): void {
    shell.dataset.digest = on ? "1" : "0";
    saveDigest(on);
    beatIndex = 0;
    updateDigestMenuHint();
    render();
  }

  function saveFocus(on: boolean): void {
    try {
      localStorage.setItem(STORAGE_FOCUS, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function setFocus(on: boolean): void {
    shell.dataset.focus = on ? "1" : "0";
    btnFocus.setAttribute("aria-pressed", on ? "true" : "false");
    btnFocus.setAttribute("aria-label", on ? "Exit focus mode" : "Focus mode");
    saveFocus(on);
  }

  function vibrate(): void {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(12);
    }
  }

  let sheetBookMode: "books" | "sections" = "books";

  function closeNavSheetOnly(): void {
    navSheet.classList.remove("sheet--open");
    navSheet.setAttribute("aria-hidden", "true");
    setBodyScrollLock();
  }

  function closeSheet(): void {
    closeNavSheetOnly();
    btnBooks.focus();
  }

  function setBodyScrollLock(): void {
    const anyOpen =
      navSheet.classList.contains("sheet--open") ||
      menuSheet.classList.contains("sheet--open") ||
      compareSheet.classList.contains("sheet--open");
    document.body.style.overflow = anyOpen ? "hidden" : "";
  }

  function closeMenu(): void {
    menuSheet.classList.remove("sheet--open");
    menuSheet.setAttribute("aria-hidden", "true");
    menuMode = "main";
    menuPanelMain.hidden = false;
    menuPanelJump.hidden = true;
    menuPanelSearch.hidden = true;
    menuPanelKeys.hidden = true;
    menuPanelAbout.hidden = true;
    menuBack.classList.add("is-inert");
    menuSheetTitle.textContent = "Menu";
    setBodyScrollLock();
    btnMenu.focus();
  }

  function showMenuPanel(mode: MenuMode): void {
    menuMode = mode;
    menuPanelMain.hidden = mode !== "main";
    menuPanelJump.hidden = mode !== "jump";
    menuPanelSearch.hidden = mode !== "search";
    menuPanelKeys.hidden = mode !== "keys";
    menuPanelAbout.hidden = mode !== "about";
    menuBack.classList.toggle("is-inert", mode === "main");
    const titles: Record<MenuMode, string> = {
      main: "Menu",
      jump: "Jump",
      search: "Search",
      keys: "Shortcuts",
      about: "About",
    };
    menuSheetTitle.textContent = titles[mode];
  }

  function refreshSearchResults(): void {
    searchResults.innerHTML = "";
    const q = searchQ.value.trim();
    if (passages.length === 0) {
      searchStatus.textContent = "";
      return;
    }
    if (q.length < 2) {
      searchStatus.textContent = "Type at least 2 letters to search.";
      return;
    }
    const qLower = q.toLowerCase();
    const hits: { p: Passage; i: number }[] = [];
    passages.forEach((p, i) => {
      if (flatText(p.text).toLowerCase().includes(qLower)) hits.push({ p, i });
    });
    const total = hits.length;
    const shown = hits.slice(0, SEARCH_MAX);
    if (total === 0) {
      searchStatus.textContent = "No matches.";
      return;
    }
    searchStatus.textContent =
      total > SEARCH_MAX
        ? `${total} matches (showing first ${SEARCH_MAX})`
        : total === 1
          ? "1 match"
          : `${total} matches`;
    const frag = document.createDocumentFragment();
    for (const { p, i } of shown) {
      const li = document.createElement("li");
      li.className = "search-hit";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-hit__btn";
      btn.setAttribute(
        "aria-label",
        `Book ${BOOK_ROMAN[p.book]}, section ${p.roman}. ${previewLine(p.text, 80)}`
      );
      if (i === index) btn.classList.add("search-hit__btn--current");
      const meta = document.createElement("span");
      meta.className = "search-hit__meta";
      meta.textContent = `Book ${BOOK_ROMAN[p.book]} · §${p.section}`;
      const sn = document.createElement("p");
      sn.className = "search-hit__snippet";
      sn.innerHTML = excerptWithMatchHtml(p.text, q);
      btn.append(meta, sn);
      btn.addEventListener("click", () => {
        index = i;
        beatIndex = 0;
        vibrate();
        closeMenu();
        render();
        passageFade();
      });
      li.appendChild(btn);
      frag.appendChild(li);
    }
    searchResults.appendChild(frag);
  }

  function ingestCorpus(data: Corpus, anchor: { book: number; section: number } | null): void {
    passages = data.passages;
    corpusMeta = { source: data.source ?? "", translator: data.translator ?? "" };
    if (anchor) {
      let i = passages.findIndex((p) => p.book === anchor.book && p.section === anchor.section);
      if (i < 0) i = passages.findIndex((p) => p.book === anchor.book);
      if (i < 0) i = 0;
      index = i;
    } else {
      loadIndex();
    }
    beatIndex = 0;
    buildBookGrid();
    buildJumpBookSelect();
    render();
  }

  async function switchTranslation(id: string): Promise<void> {
    if (id === activeTranslationId && passages.length > 0) {
      translationSelect.value = activeTranslationId;
      return;
    }
    const t = TRANSLATIONS.find((x) => x.id === id);
    if (!t) return;
    const anchor = { book: passages[index]?.book ?? 1, section: passages[index]?.section ?? 1 };
    try {
      const r = await fetch(t.file);
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as Corpus;
      corpusCache.set(id, data);
      saveTranslationId(id);
      activeTranslationId = id;
      ingestCorpus(data, anchor);
      translationSelect.value = id;
      refreshSearchResults();
    } catch {
      translationSelect.value = activeTranslationId;
      meta.textContent = "Could not load translation";
    }
  }

  function closeCompareSheet(): void {
    compareSheet.classList.remove("sheet--open");
    compareSheet.setAttribute("aria-hidden", "true");
    setBodyScrollLock();
  }

  async function fillCompare(): Promise<void> {
    const p = passages[index];
    if (!p) return;
    const otherId = compareOtherSelect.value;
    compareMeta.textContent = `Book ${BOOK_ROMAN[p.book]} · Section ${p.section}`;
    let otherData: Corpus;
    if (corpusCache.has(otherId)) {
      otherData = corpusCache.get(otherId)!;
    } else {
      const tr = TRANSLATIONS.find((x) => x.id === otherId);
      if (!tr) return;
      try {
        const r = await fetch(tr.file);
        if (!r.ok) return;
        otherData = (await r.json()) as Corpus;
        corpusCache.set(otherId, otherData);
      } catch {
        compareGrid.innerHTML = "<p class=\"compare-miss\">Could not load the other edition.</p>";
        return;
      }
    }
    const op = otherData.passages.find((x) => x.book === p.book && x.section === p.section);
    compareGrid.innerHTML = "";
    const colA = document.createElement("div");
    colA.className = "compare-col";
    const labelA = TRANSLATION_LABELS[activeTranslationId] ?? activeTranslationId;
    colA.innerHTML = `<h3 class="compare-col__label">${escapeHtml(labelA)}</h3><p class="compare-col__text">${passageToHtml(p.text)}</p>`;
    const colB = document.createElement("div");
    colB.className = "compare-col";
    const labelB = TRANSLATION_LABELS[otherId] ?? otherId;
    if (op) {
      colB.innerHTML = `<h3 class="compare-col__label">${escapeHtml(labelB)}</h3><p class="compare-col__text">${passageToHtml(op.text)}</p>`;
    } else {
      colB.innerHTML = `<h3 class="compare-col__label">${escapeHtml(labelB)}</h3><p class="compare-col__muted">No matching section in this edition.</p>`;
    }
    compareGrid.append(colA, colB);
  }

  function openCompareSheet(): void {
    if (navSheet.classList.contains("sheet--open")) closeNavSheetOnly();
    if (menuSheet.classList.contains("sheet--open")) closeMenu();
    compareOtherSelect.innerHTML = "";
    for (const tr of TRANSLATIONS) {
      if (tr.id === activeTranslationId) continue;
      const o = document.createElement("option");
      o.value = tr.id;
      o.textContent = TRANSLATION_LABELS[tr.id] ?? tr.id;
      compareOtherSelect.appendChild(o);
    }
    const firstOther = TRANSLATIONS.find((x) => x.id !== activeTranslationId);
    if (firstOther) compareOtherSelect.value = firstOther.id;
    void fillCompare();
    compareSheet.classList.add("sheet--open");
    compareSheet.setAttribute("aria-hidden", "false");
    setBodyScrollLock();
  }

  async function goToPassage(opts: {
    book: number;
    section: number;
    translationId?: string;
  }): Promise<void> {
    const tid = opts.translationId ?? activeTranslationId;
    if (tid !== activeTranslationId || passages.length === 0) {
      await switchTranslation(tid);
    }
    const i = passages.findIndex((p) => p.book === opts.book && p.section === opts.section);
    if (i >= 0) {
      index = i;
      beatIndex = 0;
      render();
    }
  }

  async function copyQuotation(): Promise<void> {
    const p = passages[index];
    if (!p) return;
    const tr = corpusMeta.translator.trim() || TRANSLATION_LABELS[activeTranslationId] || activeTranslationId;
    const block = `${flatText(p.text)}\n\n— Marcus Aurelius, Meditations, Book ${BOOK_ROMAN[p.book]}, §${p.section}. ${tr}`;
    try {
      await navigator.clipboard.writeText(block);
      meta.textContent = "Copied to clipboard";
      window.setTimeout(() => render(), 1400);
    } catch {
      meta.textContent = "Could not copy";
      window.setTimeout(() => render(), 1600);
    }
  }

  function openMenuSheet(): void {
    if (navSheet.classList.contains("sheet--open")) closeNavSheetOnly();
    showMenuPanel("main");
    menuSheet.classList.add("sheet--open");
    menuSheet.setAttribute("aria-hidden", "false");
    setBodyScrollLock();
    translationSelect.value = activeTranslationId;
    themeSelect.value = document.documentElement.dataset.theme === "sepia" || document.documentElement.dataset.theme === "paper"
      ? document.documentElement.dataset.theme
      : "dark";
    updateStreakLine();
    updateDigestMenuHint();
    btnMenu.focus();
  }

  function openMenuSub(mode: Exclude<MenuMode, "main">): void {
    if (mode === "jump") {
      jumpError.hidden = true;
      const p = passages[index];
      if (p) {
        jumpBook.value = String(p.book);
        jumpSection.value = String(p.section);
      }
    }
    if (mode === "search") {
      refreshSearchResults();
      requestAnimationFrame(() => searchQ.focus());
    }
    if (mode === "about") {
      const src = corpusMeta.source.trim();
      const tr = corpusMeta.translator.trim();
      aboutSource.textContent = src ? `Source: ${src}.` : "";
      aboutSource.hidden = !src;
      aboutTranslator.textContent = tr ? `Edition: ${tr}.` : "";
      aboutTranslator.hidden = !tr;
    }
    showMenuPanel(mode);
  }

  function openMenuToSearch(): void {
    if (navSheet.classList.contains("sheet--open")) closeNavSheetOnly();
    if (!menuSheet.classList.contains("sheet--open")) {
      menuSheet.classList.add("sheet--open");
      menuSheet.setAttribute("aria-hidden", "false");
      setBodyScrollLock();
    }
    openMenuSub("search");
  }

  function buildJumpBookSelect(): void {
    jumpBook.innerHTML = "";
    for (let b = 1; b <= 12; b++) {
      const o = document.createElement("option");
      o.value = String(b);
      o.textContent = `Book ${BOOK_ROMAN[b]}`;
      jumpBook.appendChild(o);
    }
  }

  function openSheetBooks(): void {
    if (menuSheet.classList.contains("sheet--open")) closeMenu();
    sheetBookMode = "books";
    sheetTitle.textContent = "Books";
    sheetBack.classList.add("is-inert");
    sheetBooks.hidden = false;
    sheetSections.hidden = true;
    highlightBookGrid();
    navSheet.classList.add("sheet--open");
    navSheet.setAttribute("aria-hidden", "false");
    setBodyScrollLock();
  }

  function highlightBookGrid(): void {
    const cur = passages[index]?.book ?? 0;
    sheetBooks.querySelectorAll(".book-cell").forEach((el, i) => {
      el.classList.toggle("book-cell--current", i + 1 === cur);
    });
  }

  function openSheetSectionsForBook(bookNum: number): void {
    if (menuSheet.classList.contains("sheet--open")) closeMenu();
    sheetBookMode = "sections";
    sheetTitle.textContent = `Book ${BOOK_ROMAN[bookNum]}`;
    sheetBack.classList.remove("is-inert");
    sheetBooks.hidden = true;
    sheetSections.hidden = false;
    sheetSections.innerHTML = "";
    const inBook = passages.filter((p) => p.book === bookNum);
    const head = document.createElement("header");
    head.className = "section-list__head";
    const metaTop = document.createElement("p");
    metaTop.className = "section-list__meta";
    metaTop.textContent = inBook.length === 1 ? "1 section" : `${inBook.length} sections`;
    head.appendChild(metaTop);
    sheetSections.appendChild(head);
    const list = document.createElement("ul");
    list.className = "section-list";
    const frag = document.createDocumentFragment();
    passages.forEach((p, i) => {
      if (p.book !== bookNum) return;
      const li = document.createElement("li");
      li.className = "section-list__item";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "section-row";
      row.setAttribute("aria-label", `Book ${BOOK_ROMAN[bookNum]}, section ${p.roman}`);
      if (i === index) row.classList.add("section-row--current");
      const badge = document.createElement("span");
      badge.className = "section-row__badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = p.roman;
      const main = document.createElement("span");
      main.className = "section-row__main";
      const kicker = document.createElement("span");
      kicker.className = "section-row__kicker";
      kicker.textContent = `Section ${p.section}`;
      const preview = document.createElement("span");
      preview.className = "section-row__preview";
      preview.textContent = previewLine(p.text);
      main.append(kicker, preview);
      row.append(badge, main);
      row.addEventListener("click", () => {
        index = i;
        beatIndex = 0;
        vibrate();
        closeSheet();
        render();
        passageFade();
      });
      li.appendChild(row);
      frag.appendChild(li);
    });
    list.appendChild(frag);
    sheetSections.appendChild(list);
    navSheet.classList.add("sheet--open");
    navSheet.setAttribute("aria-hidden", "false");
    setBodyScrollLock();
    requestAnimationFrame(() => {
      sheetSections.querySelector(".section-row--current")?.scrollIntoView({ block: "nearest" });
    });
  }

  function buildBookGrid(): void {
    sheetBooks.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let b = 1; b <= 12; b++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-cell";
      btn.textContent = BOOK_ROMAN[b];
      btn.setAttribute("aria-label", `Book ${BOOK_ROMAN[b]}`);
      btn.addEventListener("click", () => {
        vibrate();
        openSheetSectionsForBook(b);
      });
      frag.appendChild(btn);
    }
    sheetBooks.appendChild(frag);
  }

  function render(): void {
    const p = passages[index];
    if (!p) return;
    const digestOn = shell.dataset.digest === "1";
    let beats = digestOn ? splitDigestBeats(p.text) : [];
    if (digestOn && beats.length === 0) beats = [flatText(p.text)];
    if (digestOn && beats.length > 0) {
      beatIndex = Math.min(beatIndex, Math.max(0, beats.length - 1));
    }
    const displayText =
      digestOn && beats.length > 0 ? (beats[beatIndex] ?? beats[0]) : p.text;
    const showBeatMeta = digestOn && beats.length > 1;
    meta.textContent = showBeatMeta
      ? `Book ${p.book} · ${ordinal(p.section)} · ${beatIndex + 1} / ${beats.length}`
      : `Book ${p.book} · ${ordinal(p.section)}`;
    const digestClass = digestOn ? " passage__p--digest" : "";
    body.innerHTML = `<p class="passage__p${digestClass}">${passageToHtml(displayText)}</p>`;
    const b = Math.max(1, beats.length);
    const pct = digestOn
      ? ((index + (beatIndex + 1) / b) / passages.length) * 100
      : ((index + 1) / passages.length) * 100;
    fill.style.width = `${pct}%`;
    saveIndex();
    syncPassageUrl();
  }

  function goPassage(delta: number, beatPos: "first" | "last" = "first"): void {
    const n = passages.length;
    if (n === 0) return;
    index = (index + delta + n) % n;
    if (shell.dataset.digest === "1") {
      const p = passages[index];
      const beats = p ? splitDigestBeats(p.text) : [];
      beatIndex =
        beatPos === "last" && beats.length > 0 ? Math.max(0, beats.length - 1) : 0;
    } else {
      beatIndex = 0;
    }
    vibrate();
    render();
    passageFade();
  }

  function goBeat(delta: number): void {
    const n = passages.length;
    if (n === 0) return;
    if (shell.dataset.digest !== "1") {
      goPassage(delta, "first");
      return;
    }
    const p = passages[index];
    if (!p) return;
    const beats = splitDigestBeats(p.text);
    if (beats.length <= 1) {
      goPassage(delta, "first");
      return;
    }
    if (delta > 0) {
      if (beatIndex < beats.length - 1) {
        beatIndex++;
        vibrate();
        render();
        passageFade();
      } else {
        goPassage(1, "first");
      }
    } else if (beatIndex > 0) {
      beatIndex--;
      vibrate();
      render();
      passageFade();
    } else {
      goPassage(-1, "last");
    }
  }

  function goRandom(): void {
    const n = passages.length;
    if (n < 2) return;
    let j = index;
    while (j === index) j = Math.floor(Math.random() * n);
    index = j;
    beatIndex = 0;
    vibrate();
    render();
    passageFade();
  }

  btnPrev.addEventListener("click", () => goBeat(-1));
  btnNext.addEventListener("click", () => goBeat(1));
  btnRand.addEventListener("click", goRandom);

  btnFocus.addEventListener("click", () => {
    const on = shell.dataset.focus !== "1";
    setFocus(on);
  });

  btnBooks.addEventListener("click", () => {
    openSheetBooks();
  });

  btnMenu.addEventListener("click", () => {
    openMenuSheet();
  });

  menuScrim.addEventListener("click", closeMenu);
  menuClose.addEventListener("click", closeMenu);
  menuBack.addEventListener("click", () => {
    if (menuMode === "main") return;
    showMenuPanel("main");
  });

  menuItemJump.addEventListener("click", () => {
    openMenuSub("jump");
  });

  menuItemSearch.addEventListener("click", () => {
    openMenuToSearch();
  });

  searchQ.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => refreshSearchResults(), 220);
  });

  menuItemKeys.addEventListener("click", () => {
    openMenuSub("keys");
  });

  menuItemAbout.addEventListener("click", () => {
    openMenuSub("about");
  });

  jumpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    jumpError.hidden = true;
    const book = Number(jumpBook.value);
    const section = Number(jumpSection.value);
    if (!Number.isFinite(section) || section < 1) {
      jumpError.textContent = "Enter a valid section number.";
      jumpError.hidden = false;
      return;
    }
    const i = passages.findIndex((p) => p.book === book && p.section === section);
    if (i < 0) {
      jumpError.textContent = `No passage for Book ${BOOK_ROMAN[book]}, section ${section}.`;
      jumpError.hidden = false;
      return;
    }
    index = i;
    beatIndex = 0;
    vibrate();
    closeMenu();
    render();
    passageFade();
  });

  menuItemDigest.addEventListener("click", () => {
    setDigest(shell.dataset.digest !== "1");
  });

  meta.addEventListener("click", () => {
    if (passages.length === 0) return;
    if (menuSheet.classList.contains("sheet--open")) closeMenu();
    openSheetSectionsForBook(passages[index].book);
  });

  sheetScrim.addEventListener("click", closeSheet);
  sheetClose.addEventListener("click", closeSheet);
  sheetBack.addEventListener("click", () => {
    openSheetBooks();
  });

  window.addEventListener("keydown", (e) => {
    if (!readerActive()) return;
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      openMenuToSearch();
      return;
    }
    if (e.key === "Escape" && compareSheet.classList.contains("sheet--open")) {
      e.preventDefault();
      closeCompareSheet();
      return;
    }
    if (e.key === "Escape" && menuSheet.classList.contains("sheet--open")) {
      e.preventDefault();
      if (menuMode !== "main") {
        showMenuPanel("main");
      } else {
        closeMenu();
      }
      return;
    }
    if (e.key === "Escape" && navSheet.classList.contains("sheet--open")) {
      e.preventDefault();
      if (sheetBookMode === "sections") {
        openSheetBooks();
      } else {
        closeSheet();
      }
      return;
    }
    if (menuSheet.classList.contains("sheet--open")) return;
    if (compareSheet.classList.contains("sheet--open")) return;
    if (navSheet.classList.contains("sheet--open")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goBeat(-1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goBeat(1);
    }
    if (e.key === "r" || e.key === "R") {
      goRandom();
    }
    if (e.key === "f" || e.key === "F") {
      setFocus(shell.dataset.focus !== "1");
    }
    if (e.key === "b" || e.key === "B") {
      openSheetBooks();
    }
    if (e.key === "m" || e.key === "M") {
      openMenuSheet();
    }
  });

  let touchStartX = 0;
  stage.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      if (!readerActive()) return;
      const dx = e.changedTouches[0].screenX - touchStartX;
      const threshold = 56;
      if (dx > threshold) goBeat(-1);
      else if (dx < -threshold) goBeat(1);
    },
    { passive: true }
  );

  translationSelect.addEventListener("change", () => {
    void switchTranslation(translationSelect.value);
  });

  loadTheme();
  const urlNav = parseUrlPassage();
  const startTid = urlNav?.translationId ?? getTranslationId();
  if (urlNav) {
    saveTranslationId(urlNav.translationId);
    activeTranslationId = urlNav.translationId;
    translationSelect.value = urlNav.translationId;
  }
  const startFile = TRANSLATIONS.find((x) => x.id === startTid)?.file ?? "/meditations.json";

  fetch(startFile)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Corpus>;
    })
    .then((data) => {
      corpusCache.set(startTid, data);
      activeTranslationId = startTid;
      ingestCorpus(data, urlNav ? { book: urlNav.book, section: urlNav.section } : null);
      translationSelect.value = activeTranslationId;
      loadFocus();
      loadDigest();
      updateDigestMenuHint();
      updateStreakLine();
      syncPassageUrl();
    })
    .catch(() => {
      meta.textContent = "Could not load text";
      body.innerHTML =
        "<p class=\"passage__p\">Place JSON in <code>public/</code> and run the dev server.</p>";
    });

  function closeReaderOverlays(): void {
    if (navSheet.classList.contains("sheet--open")) closeSheet();
    if (menuSheet.classList.contains("sheet--open")) closeMenu();
    if (compareSheet.classList.contains("sheet--open")) closeCompareSheet();
    setBodyScrollLock();
  }

  compareScrim.addEventListener("click", closeCompareSheet);
  compareClose.addEventListener("click", closeCompareSheet);
  compareOtherSelect.addEventListener("change", () => {
    void fillCompare();
  });

  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });

  menuItemToday.addEventListener("click", () => {
    if (passages.length === 0) return;
    const j = dailyPassageIndex(passages.length);
    index = j;
    beatIndex = 0;
    vibrate();
    closeMenu();
    render();
    passageFade();
  });

  menuItemCompare.addEventListener("click", () => {
    closeMenu();
    openCompareSheet();
  });

  menuItemCopy.addEventListener("click", () => {
    void copyQuotation();
    closeMenu();
  });

  return { closeOverlays: closeReaderOverlays, goToPassage };
}
