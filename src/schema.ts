import { defineTable, column, NOW } from 'astro:db';

/** Astro DB table definition for Respectify comments. Merge into your db/config.ts. */
export const RespectifyComment = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    postSlug: column.text(),
    author: column.text(),
    email: column.text({ optional: true }),
    content: column.text(),
    createdAt: column.date({ default: NOW }),
    approved: column.boolean({ default: false }),
    parentId: column.number({ optional: true }),
  },
  indexes: [
    { on: ['postSlug'], unique: false },
    { on: ['approved'], unique: false },
  ],
});

/** Alias for backwards compatibility with existing schemas */
export const Comment = RespectifyComment;
