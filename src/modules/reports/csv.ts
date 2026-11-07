export type CsvCell=string|number;
export function phpDecimal(centavos:number){
 if(!Number.isSafeInteger(centavos))throw Error('An exact integer centavo amount is required.');
 const amount=BigInt(centavos),n=amount<0n?-amount:amount;return `${amount<0n?'-':''}${n/100n}.${String(n%100n).padStart(2,'0')}`;
}
function cell(value:CsvCell){
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('CSV numeric fields require safe integers.');
 let text=String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,'');
 // Preserve the original text, but recognize disguised spreadsheet formula prefixes.
 if(typeof value==='string'&&/^[\s\u200B-\u200F\uFEFF]*[=+\-@]/u.test(text.normalize('NFKC')))text="'"+text;
 return `"${text.replaceAll('"','""')}"`;
}
export function csvDocument(headers:string[],rows:CsvCell[][]){
 if(rows.some(row=>row.length!==headers.length))throw Error('CSV row shape does not match its headers.');
 return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
