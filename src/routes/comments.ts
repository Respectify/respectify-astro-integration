import type { APIContext } from 'astro';
import { db, Comment as CommentTable, eq, and, asc } from 'astro:db';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const slug = context.url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const comments = await db
      .select({
        id: CommentTable.id,
        author: CommentTable.author,
        content: CommentTable.content,
        createdAt: CommentTable.createdAt,
      })
      .from(CommentTable)
      .where(and(eq(CommentTable.postSlug, slug), eq(CommentTable.approved, true)))
      .orderBy(asc(CommentTable.createdAt));

    return new Response(JSON.stringify({ comments }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response(JSON.stringify({ comments: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}
