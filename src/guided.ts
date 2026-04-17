/** Guided meditations — second app feature (sessions UI to be expanded). */
export function initGuided(mount: HTMLElement): void {
  mount.innerHTML = `
    <div class="guided-shell">
      <header class="guided-header">
        <h1 class="guided-title">Guided meditations</h1>
        <p class="guided-lead">Short, structured sessions—breathing, prompts, and silence—built around Stoic practice.</p>
      </header>
      <main class="guided-main">
        <p class="guided-placeholder">Your first guided sessions will appear here.</p>
      </main>
    </div>
  `;
}
