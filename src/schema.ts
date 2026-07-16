import { defineTable, column, NOW } from 'astro:db';
import type { TableConfig } from '@astrojs/db/types';

const respectifyCommentColumns = {
  id: column.number({ primaryKey: true }),
  postSlug: column.text(),
  author: column.text(),
  email: column.text({ optional: true }),
  content: column.text(),
  createdAt: column.date({ default: NOW }),
  approved: column.boolean({ default: false }),
  parentId: column.number({ optional: true }),
};

/** Astro DB table definition for Respectify comments. Merge into your db/config.ts. */
export const RespectifyComment: TableConfig<typeof respectifyCommentColumns> = defineTable({
  columns: respectifyCommentColumns,
  indexes: [
    { on: ['postSlug'], unique: false },
    { on: ['approved'], unique: false },
  ],
});

/** Alias for backwards compatibility with existing schemas */
export const Comment = RespectifyComment;
