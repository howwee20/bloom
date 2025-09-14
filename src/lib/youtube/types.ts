export type YTComment = {
  id: string;
  author: string;
  text: string; // plain text, truncated client-side
  likes?: number;
  publishedAt?: string; // ISO
};
