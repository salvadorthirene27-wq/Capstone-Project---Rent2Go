import {redirect} from 'next/navigation';
import {pageActor} from '@/lib/page-actor';
export const dynamic='force-dynamic';
export default async function Page(){await pageActor();redirect('/workspace#notifications');}
