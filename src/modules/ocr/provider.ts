import {ocrMaxBytes} from './presentation';
export type OcrOutput={outcome:'SUCCEEDED'|'PARTIAL'|'FAILED'|'CANCELLED'|'UNKNOWN';text:string;pages:number;reason:string;providerCode:number|null};
export const ocrFailure=(reason:string):OcrOutput=>({outcome:'FAILED',text:'',pages:0,reason,providerCode:null});
export function parseOcrResponse(body:any):OcrOutput{
 const code=Number(body?.OCRExitCode);if(!Number.isInteger(code)||![1,2,3,4].includes(code))return ocrFailure('INVALID_RESPONSE');if([3,4].includes(code))return {...ocrFailure('PROVIDER_ERROR'),providerCode:code};if(!Array.isArray(body?.ParsedResults))return ocrFailure('INVALID_RESPONSE');
 const pages=body.ParsedResults;if(pages.length>3)return ocrFailure('INVALID_RESPONSE');
 const valid=pages.filter((p:any)=>Number(p?.FileParseExitCode)===1&&typeof p.ParsedText==='string');
 let text=valid.map((p:any)=>p.ParsedText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,'')).join('\n\n').trim();
 if(![1,2].includes(code)||!text)return {...ocrFailure(text?'PROVIDER_ERROR':'NO_TEXT'),providerCode:code};
 const characters=Array.from(text),overflow=characters.length>20000;if(overflow)text=characters.slice(0,20000).join('');
 const partial=overflow||code===2||body.IsErroredOnProcessing===true||valid.length!==pages.length;
 return {outcome:partial?'PARTIAL':'SUCCEEDED',text,pages:valid.length,reason:overflow?'OUTPUT_LIMIT':partial?'PARTIAL':'OK',providerCode:code};
}
export async function extractDocumentText(bytes:Uint8Array,mime:string):Promise<OcrOutput>{
 const key=process.env.OCR_SPACE_API_KEY;if(!key)return ocrFailure('UNAVAILABLE');if(bytes.length>ocrMaxBytes)return ocrFailure('FILE_MISMATCH');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const body=new FormData();body.append('file',new Blob([Buffer.from(bytes)],{type:mime}),mime==='application/pdf'?'document.pdf':mime==='image/jpeg'?'document.jpg':'document.png');body.append('OCREngine','2');body.append('language','auto');body.append('isOverlayRequired','false');body.append('isCreateSearchablePdf','false');body.append('detectOrientation','true');
  const response=await fetch('https://api.ocr.space/parse/image',{method:'POST',headers:{apikey:key},body,signal:controller.signal,redirect:'error'});if(!response.ok)return ocrFailure('UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)return ocrFailure('INVALID_RESPONSE');const chunks:Uint8Array[]= [];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();return ocrFailure('INVALID_RESPONSE');}chunks.push(part.value);}
  const all=Buffer.concat(chunks);try{return parseOcrResponse(JSON.parse(all.toString('utf8')));}catch{return ocrFailure('INVALID_RESPONSE');}
 }catch{return ocrFailure(controller.signal.aborted?'TIMEOUT':'UNAVAILABLE');}finally{clearTimeout(timer);}
}
