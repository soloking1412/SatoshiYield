export function Footer() {
  return (
    <footer className="border-t border-surface-border mt-auto">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="text-xs text-text-muted font-mono">
          SatoshiYield &mdash; non-custodial sBTC yield on Stacks
        </span>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <a
            href="https://github.com/soloking/SatoshiYield"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-secondary transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://docs.stacks.co"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-secondary transition-colors"
          >
            Stacks Docs
          </a>
        </div>
      </div>
    </footer>
  );
}
