import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold mb-4">ZAP</h1>
      <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
        Zero-Copy App Proto - High-performance ZAP RPC for AI agent communication
      </p>
      <div className="flex gap-4">
        <Link
          href="/docs"
          className="rounded-md bg-primary px-6 py-3 text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          Documentation
        </Link>
        <a
          href="https://github.com/zap-protocol/zap-js"
          className="rounded-md border border-border px-6 py-3 font-medium hover:bg-accent transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
