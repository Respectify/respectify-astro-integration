export interface CommentResponse {
  id: number;
  author: string;
  content: string;
  createdAt: string;
}

export function formatCommentDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderCommentHtml(comment: CommentResponse, options?: { showDelete?: boolean }): string {
  const formattedDate = formatCommentDate(comment.createdAt);
  const deleteControls = options?.showDelete
    ? `
      <span class="rf-comments__delete-controls" data-delete-for="${comment.id}">
        <button class="rf-comments__delete-btn" data-comment-id="${comment.id}" type="button">Delete</button>
        <span class="rf-comments__delete-confirm">
          <span>Delete?</span>
          <button class="rf-comments__delete-btn confirm-delete-btn" data-comment-id="${comment.id}" type="button">Yes</button>
          <button class="rf-comments__delete-cancel cancel-delete-btn" type="button">Cancel</button>
        </span>
        <span class="rf-comments__delete-error rf-comments__hidden"></span>
      </span>`
    : '';

  return `
    <article class="rf-comments__item" data-comment-id="${comment.id}">
      <header class="rf-comments__item-header">
        <div>
          <span class="rf-comments__author">${escapeHtml(comment.author)}</span>
          ${deleteControls}
        </div>
        <time class="rf-comments__date" datetime="${comment.createdAt}">${formattedDate}</time>
      </header>
      <div class="rf-comments__content">${escapeHtml(comment.content)}</div>
    </article>`;
}

export async function fetchComments(apiPath: string, postSlug: string): Promise<CommentResponse[]> {
  const url = `${apiPath}?slug=${encodeURIComponent(postSlug)}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as { comments?: CommentResponse[] };
  return data.comments ?? [];
}
