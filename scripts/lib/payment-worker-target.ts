import {payMongoConfig} from '../../src/modules/gateway/paymongo';
export function paymentWorkerTarget(env:Record<string,string|undefined>,args:string[]){
 if((!args.includes('--enable')&&env.PAYMONGO_WORKER_ENABLED!=='true')||env.NEON_PROJECT_ID!=='floral-flower-08375841')throw Error('Explicitly enable the payment worker on the designated Rent2Go project.');
 // Includes separate provider/live gates; --enable cannot bypass either.
 payMongoConfig(env);
 const test=args.includes('--test'),connection=test?env.TEST_DATABASE_URL:env.DATABASE_URL;
 let target:URL;try{target=new URL(connection??'');}catch{throw Error('Payment worker database target is invalid.');}
 if(!target.hostname.startsWith('ep-dawn-rain-aowtcdg5')||target.pathname!==(test?'/rent2go_test':'/rent2go')||(!test&&decodeURIComponent(target.username)!=='rent2go_app'))throw Error('Unexpected payment worker database target.');
 return connection!;
}
