import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function TagsPageRedirect() {
  redirect('/dashboard/categories?tab=tags');
}
