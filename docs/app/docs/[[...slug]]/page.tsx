import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { source } from '@/lib/source';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <h1 className="text-3xl font-bold mb-2">{page.data.title}</h1>
      {page.data.description && (
        <p className="text-lg text-muted-foreground mb-6">{page.data.description}</p>
      )}
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) {
    return {
      title: 'Not Found',
    };
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
