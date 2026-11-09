"use client";
import {useState} from 'react';
import {CarFront} from 'lucide-react';
export function WorkspaceServicePhoto({src,title}:{src:string|null;title:string}){
 const [failed,setFailed]=useState<string|null>(null);
 return src&&failed!==src?<img src={src} width={96} height={72} loading="lazy" alt={title} onError={()=>setFailed(src)}/>:<span className="workspace-service-placeholder" role="img" aria-label={`Photo unavailable: ${title}`}><CarFront size={26} aria-hidden="true"/></span>;
}
