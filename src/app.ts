import { initReader } from "./reader";
import { initGuided } from "./guided";

const STORAGE_FEATURE = "aurelius-feature";

export type AppFeature = "reader" | "guided";

export function initApp(appRoot: HTMLElement): void {
  appRoot.innerHTML = `
    <div class="app">
      <nav class="feature-nav" aria-label="App sections">
        <button type="button" class="feature-nav__btn is-active" data-feature="reader" role="tab" aria-selected="true" id="tab-reader">
          Reader
        </button>
        <button type="button" class="feature-nav__btn" data-feature="guided" role="tab" aria-selected="false" id="tab-guided">
          Guided
        </button>
      </nav>
      <div class="feature-panel" id="reader-panel" data-feature-panel="reader"></div>
      <div class="feature-panel" id="guided-panel" data-feature-panel="guided" hidden></div>
    </div>
  `;

  const readerPanel = appRoot.querySelector<HTMLElement>("#reader-panel")!;
  const guidedPanel = appRoot.querySelector<HTMLElement>("#guided-panel")!;
  const tabReader = appRoot.querySelector<HTMLButtonElement>("#tab-reader")!;
  const tabGuided = appRoot.querySelector<HTMLButtonElement>("#tab-guided")!;
  const reader = initReader(readerPanel);
  initGuided(guidedPanel);

  function loadSavedFeature(): AppFeature {
    try {
      const s = localStorage.getItem(STORAGE_FEATURE);
      if (s === "guided") return "guided";
    } catch {
      /* ignore */
    }
    return "reader";
  }

  function saveFeature(which: AppFeature): void {
    try {
      localStorage.setItem(STORAGE_FEATURE, which);
    } catch {
      /* ignore */
    }
  }

  function setFeature(which: AppFeature): void {
    const isReader = which === "reader";
    readerPanel.hidden = !isReader;
    guidedPanel.hidden = isReader;
    tabReader.classList.toggle("is-active", isReader);
    tabGuided.classList.toggle("is-active", !isReader);
    tabReader.setAttribute("aria-selected", isReader ? "true" : "false");
    tabGuided.setAttribute("aria-selected", isReader ? "false" : "true");
    if (!isReader) reader.closeOverlays();
    saveFeature(which);
  }

  tabReader.addEventListener("click", () => setFeature("reader"));
  tabGuided.addEventListener("click", () => setFeature("guided"));

  setFeature(loadSavedFeature());
}
