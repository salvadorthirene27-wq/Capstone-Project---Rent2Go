import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readPolicy} from '@/modules/platform/read';
import {DomainError} from '@/modules/partners/workflow';
import {date} from '@/modules/partners/presentation';
import photos from '../../../public/demo/credits.json';
export const dynamic='force-dynamic';
export const metadata={title:'Marketplace terms'};
export default async function Page({searchParams}:{searchParams:Promise<{revision?:string}>}){
 const q=await searchParams;if(q.revision!==undefined&&(typeof q.revision!=='string'||!/^[1-9][0-9]{0,8}$/.test(q.revision)))notFound();const p=await readPolicy(undefined,q.revision===undefined?undefined:Number(q.revision)).catch(e=>{if(e instanceof DomainError&&e.status===404)notFound();throw e;});
 return <main id="main-content" className="public-main agency-profile"><Link className="back-link" href="/">Marketplace home</Link><p className="eyebrow">Marketplace policy</p><h1>{p.payload.termsTitle}</h1><p>Version {p.revision} · published {date(p.publishedAt)}</p><section className="context-section"><p className="preserve-lines">{p.payload.termsText}</p></section><p>Each quotation and agreement preserves the terms supplied when it was issued. Later publications apply to new quotations. Agency-specific service terms appear in the exact quotation and agreement.</p><div className="actions"><Link className="button secondary" href="/terms">Current platform terms</Link><Link className="button" href="/help">Booking and account help</Link></div><details className="context-section"><summary>Media licences</summary>{photos.filter(photo=>photo.license.startsWith('CC BY')).map(photo=><p key={photo.file}><a href={photo.source}>{photo.title}</a> by {photo.author}. <a href={photo.licenseUrl}>{photo.license}</a>. {photo.changes}</p>)}</details></main>;
}
