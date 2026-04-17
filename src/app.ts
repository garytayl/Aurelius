import { initReader } from "./reader";
import { initGuided } from "./guided";

const STORAGE_START_THRESHOLD = "aurelius-start-threshold";

type Phase = "threshold" | "reader" | "guided";

function loadPreferThreshold(): boolean {
  try {
    return localStorage.getItem(STORAGE_START_THRESHOLD) !== "0";
  } catch {
    return true;
  }
}

function savePreferThreshold(show: boolean): void {
  try {
    localStorage.setItem(STORAGE_START_THRESHOLD, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function initApp(appRoot: HTMLElement): void {
  appRoot.innerHTML = `
    <div class="app" data-phase="threshold">
      <div class="threshold" id="threshold">
        <div class="threshold__veil" aria-hidden="true"></div>
        <div class="threshold__inner">
          <p class="threshold__kicker">Aurelius</p>
          <h1 class="threshold__title">Meditations</h1>
          <p class="threshold__author">Marcus Aurelius</p>
          <div class="threshold__actions">
            <button type="button" class="threshold__btn threshold__btn--primary" id="threshold-continue" disabled>Continue</button>
            <button type="button" class="threshold__btn" id="threshold-today" disabled>Today</button>
            <button type="button" class="threshold__btn" id="threshold-open" disabled>Open the text</button>
          </div>
          <p class="threshold__footer">
            <button type="button" class="threshold__link" id="threshold-sessions" disabled>Sessions</button>
          </p>
        </div>
      </div>
      <div class="feature-panel feature-panel--chamber" id="reader-panel" data-feature-panel="reader" hidden></div>
      <div class="feature-panel feature-panel--aside" id="guided-panel" data-feature-panel="guided" hidden></div>
    </div>
  `;

  const appEl = appRoot.querySelector<HTMLElement>(".app")!;
  const thresholdEl = appRoot.querySelector<HTMLElement>("#threshold")!;
  const readerPanel = appRoot.querySelector<HTMLElement>("#reader-panel")!;
  const guidedPanel = appRoot.querySelector<HTMLElement>("#guided-panel")!;

  const btnContinue = appRoot.querySelector<HTMLButtonElement>("#threshold-continue")!;
  const btnToday = appRoot.querySelector<HTMLButtonElement>("#threshold-today")!;
  const btnOpen = appRoot.querySelector<HTMLButtonElement>("#threshold-open")!;
  const btnSessions = appRoot.querySelector<HTMLButtonElement>("#threshold-sessions")!;

  const reader = initReader(readerPanel);
  initGuided(guidedPanel);

  let readerReady = false;

  function setPhase(phase: Phase): void {
    appEl.dataset.phase = phase;
    const atThreshold = phase === "threshold";
    const atReader = phase === "reader";
    const atGuided = phase === "guided";
    thresholdEl.hidden = !atThreshold;
    readerPanel.hidden = !atReader;
    guidedPanel.hidden = !atGuided;
    if (phase !== "reader") reader.closeOverlays();
  }

  function enterReader(): void {
    savePreferThreshold(false);
    setPhase("reader");
  }

  function showThreshold(): void {
    savePreferThreshold(true);
    setPhase("threshold");
    if (readerReady) enableThresholdControls();
  }

  function enableThresholdControls(): void {
    btnContinue.disabled = false;
    btnToday.disabled = false;
    btnOpen.disabled = false;
    btnSessions.disabled = false;
  }

  window.addEventListener("aurelius:reader-ready", () => {
    readerReady = true;
    enableThresholdControls();
  });

  window.addEventListener("aurelius:return-threshold", () => {
    reader.closeOverlays();
    showThreshold();
  });

  btnContinue.addEventListener("click", () => {
    enterReader();
  });

  btnToday.addEventListener("click", () => {
    enterReader();
    reader.goToTodaySession();
  });

  btnOpen.addEventListener("click", () => {
    enterReader();
    reader.openFromBeginning();
  });

  btnSessions.addEventListener("click", () => {
    savePreferThreshold(false);
    setPhase("guided");
  });

  window.addEventListener(
    "aurelius:open-passage",
    ((e: Event) => {
      const ce = e as CustomEvent<{ book: number; section: number; translationId?: string }>;
      const d = ce.detail;
      if (!d || typeof d.book !== "number" || typeof d.section !== "number") return;
      enterReader();
      void reader.goToPassage({
        book: d.book,
        section: d.section,
        translationId: d.translationId,
      });
    }) as EventListener
  );

  window.addEventListener("aurelius:go-today", () => {
    enterReader();
    reader.goToTodaySession();
  });

  if (loadPreferThreshold()) {
    setPhase("threshold");
  } else {
    setPhase("reader");
  }
}
