'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Installation', href: '/docs/' },
      { title: 'Quick Start', href: '/docs/quickstart/' },
    ],
  },
  {
    title: 'Core API',
    items: [
      { title: 'Client', href: '/docs/client/' },
      { title: 'Gateway', href: '/docs/gateway/' },
      { title: 'Server', href: '/docs/server/' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'TypeScript Types', href: '/docs/types/' },
      { title: 'Configuration', href: '/docs/config/' },
      { title: 'Error Handling', href: '/docs/errors/' },
      { title: 'Identity & DIDs', href: '/docs/identity/' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Browser Usage', href: '/docs/browser/' },
      { title: 'Node.js Usage', href: '/docs/nodejs/' },
      { title: 'Examples', href: '/docs/examples/' },
    ],
  },
]

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-bold">ZAP</span>
                <span className="text-zinc-500 dark:text-zinc-400">TypeScript</span>
              </Link>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="/docs/" className="text-sm font-medium text-primary-600 dark:text-primary-400">
                Documentation
              </Link>
              <a
                href="https://github.com/zap-protocol/zap-js"
                className="text-sm hover:text-primary-600 dark:hover:text-primary-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-12 py-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24 space-y-8">
              {navigation.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                    {section.title}
                  </h3>
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname === item.href.slice(0, -1)
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`nav-link ${isActive ? 'active' : ''}`}
                          >
                            {item.title}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <div className="prose">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
