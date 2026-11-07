import {afterEach,it,expect,vi} from 'vitest';
import {parseOcrResponse,extractDocumentText} from '../../src/modules/ocr/provider';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('distinguishes provider success, partial, empty and failure results without exposing arbitrary provider errors',()=>{
 const p={OCRExitCode:1,IsErroredOnProcessing:false,ParsedResults:[{FileParseExitCode:'1',ParsedText:'SYNTHETIC\u0000 TEXT'}]};expect(parseOcrResponse(p)).toMatchObject({outcome:'SUCCEEDED',text:'SYNTHETIC TEXT',pages:1});expect(parseOcrResponse({...p,OCRExitCode:'2'}).outcome).toBe('PARTIAL');expect(parseOcrResponse({...p,IsErroredOnProcessing:true}).outcome).toBe('PARTIAL');expect(parseOcrResponse({OCRExitCode:4,ErrorMessage:'PRIVATE CONTENT OR KEY',ParsedResults:null})).toMatchObject({outcome:'FAILED',text:'',reason:'PROVIDER_ERROR'});expect(JSON.stringify(parseOcrResponse({OCRExitCode:4,ErrorMessage:'PRIVATE CONTENT OR KEY'}))).not.toContain('PRIVATE');expect(parseOcrResponse({...p,ParsedResults:[{FileParseExitCode:1,ParsedText:'   '}]}).reason).toBe('NO_TEXT');expect(parseOcrResponse({...p,ParsedResults:Array(4).fill(p.ParsedResults[0])}).reason).toBe('INVALID_RESPONSE');
});
it('bounds partial text by full Unicode characters and does not fetch any returned provider link',()=>{
 const value=parseOcrResponse({OCRExitCode:1,ParsedResults:[{FileParseExitCode:1,ParsedText:'🚙'.repeat(20001)}],SearchablePDFURL:'https://foreign.test/private'});expect(value.reason).toBe('OUTPUT_LIMIT');expect(Array.from(value.text)).toHaveLength(20000);expect(value.text.endsWith('🚙')).toBe(true);expect(JSON.stringify(value)).not.toContain('foreign.test');
});
it('sends only stored bytes to the fixed HTTPS endpoint with the key in a header and safe generic filename',async()=>{
 vi.stubEnv('OCR_SPACE_API_KEY','synthetic-key');const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({OCRExitCode:1,ParsedResults:[{FileParseExitCode:1,ParsedText:'Synthetic'}]})));vi.stubGlobal('fetch',fetcher);expect((await extractDocumentText(Buffer.from('stored synthetic bytes'),'image/png')).outcome).toBe('SUCCEEDED');const [url,options]=fetcher.mock.calls[0];expect(url).toBe('https://api.ocr.space/parse/image');expect(url).not.toContain('synthetic-key');expect(options.headers).toEqual({apikey:'synthetic-key'});expect(options.redirect).toBe('error');expect((options.body as FormData).has('url')).toBe(false);expect((options.body as FormData).get('isCreateSearchablePdf')).toBe('false');expect(((options.body as FormData).get('file') as File).name).toBe('document.png');
});

it('treats malformed provider data as a manual-review fallback without returning its contents',async()=>{
 vi.stubEnv('OCR_SPACE_API_KEY','synthetic-key');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('PRIVATE UNEXPECTED CONTENT')));const result=await extractDocumentText(Buffer.from('synthetic'),'image/png');expect(result.reason).toBe('INVALID_RESPONSE');expect(result.text).toBe('');expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
