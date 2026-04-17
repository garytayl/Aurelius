import { initReader } from "./reader";

/**
 * One surface: the passage. No entry screen, no secondary app modes.
 */
export function initApp(appRoot: HTMLElement): void {
  appRoot.innerHTML = `<div class="app" id="reader-panel"></div>`;

  const readerPanel = appRoot.querySelector<HTMLElement>("#reader-panel")!;
  const reader = initReader(readerPanel);

  window.addEventListener(
    "aurelius:open-passage",
    ((e: Event) => {
      const ce = e as CustomEvent<{ book: number; section: number; translationId?: string }>;
      const d = ce.detail;
      if (!d || typeof d.book !== "number" || typeof d.section !== "number") return;
      void reader.goToPassage({
        book: d.book,
        section: d.section,
        translationId: d.translationId,
      });
    }) as EventListener
  );

  window.addEventListener("aurelius:go-today", () => {
    reader.goToTodaySession();
  });
}
