/** What every booking screen shares: the card, the texts, the buttons and the four states (design-system.md). */
export const PAGE_STYLES = `
  .card {
    display: grid; gap: var(--space-4); max-width: calc(var(--space-16) * 10); margin: 0 auto; padding: var(--space-6);
    background: var(--color-bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
  }
  h1 { margin: 0; font-size: var(--font-size-xl); line-height: var(--line-height-tight); }
  h2 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-bold); }
  p, dl, dd { margin: 0; }
  .muted { color: var(--color-text-secondary); }
  .lines { display: grid; grid-template-columns: 1fr auto; gap: var(--space-2) var(--space-4); }
  .total { padding-top: var(--space-2); border-top: solid var(--color-neutral-100); font-weight: var(--font-weight-bold); }
  a { color: var(--color-primary-900); font-weight: var(--font-weight-bold); }
  button, .primary { font: inherit; cursor: pointer; border-radius: var(--radius-md); }
  .primary {
    display: block; padding: var(--space-3); text-align: center; text-decoration: none; font-size: var(--font-size-lg);
    color: var(--color-text-on-dark); background: var(--color-primary-500); border: solid var(--color-primary-500);
  }
  .secondary {
    justify-self: start; padding: var(--space-2) var(--space-6); color: var(--color-primary-900);
    background: var(--color-bg-card); border: solid var(--color-primary-900);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  [role='alert'] { display: grid; justify-items: start; gap: var(--space-4); }
  .error { color: var(--color-error); font-size: var(--font-size-sm); }
  .skeleton { display: grid; gap: var(--space-3); }
  .skeleton div { height: var(--font-size-xl); border-radius: var(--radius-sm); background: var(--color-neutral-100); }
  .skeleton div:nth-child(2n) { width: 60%; }
`;
