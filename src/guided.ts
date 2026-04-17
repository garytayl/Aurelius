import type { Corpus, Passage } from "./types";
import { splitDigestBeats } from "./beats";

type GuidedStep =
  | { kind: "intro"; text: string }
  | { kind: "breathe"; seconds: number; hint?: string }
  | { kind: "silence"; seconds: number }
  | { kind: "read"; book: number; section: number; lead?: string }
  | { kind: "reflect"; prompt: string };

type GuidedSession = {
  id: string;
  title: string;
  subtitle?: string;
  steps: GuidedStep[];
};

type GuidedManifest = { sessions: GuidedSession[] };

const CORPUS_GUIDED = "/meditations.json";

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

function findPassage(passages: Passage[], book: number, section: number): Passage | undefined {
  return passages.find((p) => p.book === book && p.section === section);
}

export function initGuided(mount: HTMLElement): void {
  let corpus: Corpus | null = null;
  let sessions: GuidedSession[] = [];

  mount.innerHTML = `
    <div class="guided-shell">
      <button type="button" class="guided-return" id="guided-return">Return</button>
      <header class="guided-header">
        <h1 class="guided-title">Sessions</h1>
        <p class="guided-lead">Breath, slow reading, silence, one prompt. Casaubon text.</p>
      </header>
      <p class="guided-error" id="guided-error" hidden role="alert"></p>
      <ul class="guided-list" id="guided-list" role="list"></ul>
      <div class="guided-run" id="guided-run" hidden>
        <div class="guided-run__bar" role="presentation"><div class="guided-run__fill" id="guided-fill"></div></div>
        <p class="guided-run__meta" id="guided-meta"></p>
        <div class="guided-run__body" id="guided-body"></div>
        <div class="guided-run__actions">
          <button type="button" class="guided-btn guided-btn--ghost" id="guided-exit">Close</button>
          <button type="button" class="guided-btn guided-btn--primary" id="guided-primary">Continue</button>
        </div>
      </div>
    </div>
  `;

  const btnGuidedReturn = mount.querySelector<HTMLButtonElement>("#guided-return")!;
  const errEl = mount.querySelector<HTMLElement>("#guided-error")!;
  const listEl = mount.querySelector<HTMLElement>("#guided-list")!;
  const runEl = mount.querySelector<HTMLElement>("#guided-run")!;
  const fillEl = mount.querySelector<HTMLElement>("#guided-fill")!;
  const metaEl = mount.querySelector<HTMLElement>("#guided-meta")!;
  const bodyEl = mount.querySelector<HTMLElement>("#guided-body")!;
  const btnExit = mount.querySelector<HTMLButtonElement>("#guided-exit")!;
  const btnPrimary = mount.querySelector<HTMLButtonElement>("#guided-primary")!;

  btnGuidedReturn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("aurelius:return-threshold"));
  });

  let activeSession: GuidedSession | null = null;
  let stepIndex = 0;
  let beatIndex = 0;
  let beats: string[] = [];
  let timerId: ReturnType<typeof setInterval> | undefined;
  let timerLeft = 0;

  function clearTimer(): void {
    if (timerId !== undefined) {
      clearInterval(timerId);
      timerId = undefined;
    }
  }

  function openReader(book: number, section: number): void {
    window.dispatchEvent(
      new CustomEvent("aurelius:open-passage", {
        detail: { book, section, translationId: "casaubon" },
      })
    );
  }

  function showList(): void {
    clearTimer();
    activeSession = null;
    runEl.hidden = true;
    listEl.hidden = false;
  }

  function renderSessionList(): void {
    listEl.innerHTML = "";
    if (sessions.length === 0) {
      const li = document.createElement("li");
      li.className = "guided-empty";
      li.textContent = "No sessions loaded.";
      listEl.appendChild(li);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const s of sessions) {
      const li = document.createElement("li");
      li.className = "guided-card-wrap";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "guided-card";
      btn.setAttribute("aria-label", `Start session: ${s.title}`);
      const h = document.createElement("span");
      h.className = "guided-card__title";
      h.textContent = s.title;
      const sub = document.createElement("span");
      sub.className = "guided-card__sub";
      sub.textContent = s.subtitle ?? `${s.steps.length} steps`;
      btn.append(h, sub);
      btn.addEventListener("click", () => startSession(s));
      li.appendChild(btn);
      frag.appendChild(li);
    }
    listEl.appendChild(frag);
  }

  function sessionProgress(): string {
    if (!activeSession) return "";
    return `Step ${stepIndex + 1} / ${activeSession.steps.length}`;
  }

  function applyStepUI(): void {
    if (!activeSession || !corpus) return;
    const steps = activeSession.steps;
    const step = steps[stepIndex];
    if (!step) {
      showList();
      return;
    }

    const pct = ((stepIndex + 1) / steps.length) * 100;
    fillEl.style.width = `${pct}%`;
    metaEl.textContent = `${activeSession.title} · ${sessionProgress()}`;
    clearTimer();
    btnPrimary.hidden = false;
    btnPrimary.textContent = "Continue";

    if (step.kind === "intro") {
      bodyEl.innerHTML = `<p class="guided-prose">${passageToHtml(step.text)}</p>`;
      btnPrimary.focus();
      return;
    }

    if (step.kind === "breathe" || step.kind === "silence") {
      const label = step.kind === "breathe" ? "Breathe" : "Silence";
      const hint = step.kind === "breathe" && step.hint ? `<p class="guided-hint">${passageToHtml(step.hint)}</p>` : "";
      timerLeft = step.seconds;
      bodyEl.innerHTML = `<p class="guided-kicker">${label}</p>${hint}<p class="guided-timer" id="guided-timer-display">${timerLeft}</p>`;
      const display = () => {
        const el = bodyEl.querySelector("#guided-timer-display");
        if (el) el.textContent = String(timerLeft);
      };
      display();
      timerId = window.setInterval(() => {
        timerLeft -= 1;
        if (timerLeft <= 0) {
          clearTimer();
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(14);
          advanceStep();
          return;
        }
        display();
      }, 1000);
      btnPrimary.hidden = true;
      return;
    }

    if (step.kind === "reflect") {
      bodyEl.innerHTML = `<p class="guided-kicker">Reflect</p><p class="guided-prose guided-prose--prompt">${passageToHtml(step.prompt)}</p>`;
      btnPrimary.textContent = "Finish";
      return;
    }

    if (step.kind === "read") {
      const p = findPassage(corpus.passages, step.book, step.section);
      if (!p) {
        bodyEl.innerHTML = `<p class="guided-miss">This edition has no passage for Book ${step.book}, section ${step.section}.</p>`;
        btnPrimary.textContent = "Skip";
        return;
      }
      beats = splitDigestBeats(p.text);
      if (beats.length === 0) beats = [flatText(p.text)];
      beatIndex = 0;
      const lead = step.lead
        ? `<p class="guided-hint">${passageToHtml(step.lead)}</p>`
        : "";
      const openBtn = `<p class="guided-open"><button type="button" class="guided-link" id="guided-open-reader">Open in Reader</button></p>`;
      const beatHtml = passageToHtml(beats[beatIndex] ?? "");
      bodyEl.innerHTML = `${lead}<p class="guided-kicker">Book ${p.book} · §${p.section}</p><p class="guided-read">${beatHtml}</p><p class="guided-beat">${beatIndex + 1} / ${beats.length}</p>${openBtn}`;
      bodyEl.querySelector("#guided-open-reader")?.addEventListener("click", () => {
        openReader(step.book, step.section);
      });
      btnPrimary.textContent = beatIndex < beats.length - 1 ? "Next line" : "Continue";
      return;
    }
  }

  function advanceStep(): void {
    if (!activeSession) return;
    stepIndex += 1;
    if (stepIndex >= activeSession.steps.length) {
      clearTimer();
      showList();
      return;
    }
    applyStepUI();
  }

  function advanceReadTap(): void {
    if (!activeSession || !corpus) return;
    const step = activeSession.steps[stepIndex];
    if (!step || step.kind !== "read") {
      advanceStep();
      return;
    }
    const p = findPassage(corpus.passages, step.book, step.section);
    if (!p) {
      advanceStep();
      return;
    }
    if (beatIndex < beats.length - 1) {
      beatIndex += 1;
      const beatHtml = passageToHtml(beats[beatIndex] ?? "");
      const readP = bodyEl.querySelector(".guided-read");
      const beatP = bodyEl.querySelector(".guided-beat");
      if (readP) readP.innerHTML = beatHtml;
      if (beatP) beatP.textContent = `${beatIndex + 1} / ${beats.length}`;
      btnPrimary.textContent = beatIndex < beats.length - 1 ? "Next line" : "Continue";
      return;
    }
    advanceStep();
  }

  function startSession(s: GuidedSession): void {
    activeSession = s;
    stepIndex = 0;
    beatIndex = 0;
    beats = [];
    listEl.hidden = true;
    runEl.hidden = false;
    applyStepUI();
  }

  btnPrimary.addEventListener("click", () => {
    if (!activeSession) return;
    const step = activeSession.steps[stepIndex];
    if (step?.kind === "read") {
      advanceReadTap();
      return;
    }
    if (step?.kind === "reflect") {
      showList();
      return;
    }
    advanceStep();
  });

  btnExit.addEventListener("click", () => {
    clearTimer();
    showList();
  });

  Promise.all([
    fetch(CORPUS_GUIDED).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Corpus>;
    }),
    fetch("/guided-sessions.json").then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<GuidedManifest>;
    }),
  ])
    .then(([c, m]) => {
      corpus = c;
      sessions = m.sessions ?? [];
      errEl.hidden = true;
      renderSessionList();
    })
    .catch(() => {
      errEl.hidden = false;
      errEl.textContent = "Could not load guided sessions or text.";
    });
}
