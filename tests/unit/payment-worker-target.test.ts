import {it,expect} from 'vitest';
import {paymentWorkerTarget} from '../../scripts/lib/payment-worker-target';
const env={NEON_PROJECT_ID:'floral-flower-08375841',DATABASE_URL:'postgresql://rent2go_app:fixture@ep-dawn-rain-aowtcdg5.example/rent2go',TEST_DATABASE_URL:'postgresql://fixture:fixture@ep-dawn-rain-aowtcdg5.example/rent2go_test',PAYMONGO_ENABLED:'true',PAYMONGO_MODE:'test',PAYMONGO_SECRET_KEY:'sk_test_workerTargetFixture',PAYMONGO_PAYMENT_METHODS:'card'};
it('requires worker opt-in plus provider enablement independently',()=>{
 expect(()=>paymentWorkerTarget(env,[])).toThrow();
 expect(()=>paymentWorkerTarget({...env,PAYMONGO_ENABLED:'false'},['--enable'])).toThrow();
 expect(paymentWorkerTarget(env,['--enable'])).toBe(env.DATABASE_URL);
 expect(paymentWorkerTarget({...env,PAYMONGO_WORKER_ENABLED:'true'},['--test'])).toBe(env.TEST_DATABASE_URL);
});
it.each([{NEON_PROJECT_ID:'old-project'},{DATABASE_URL:env.TEST_DATABASE_URL},{DATABASE_URL:env.DATABASE_URL.replace('rent2go_app','owner')},{DATABASE_URL:env.DATABASE_URL.replace('ep-dawn-rain-aowtcdg5','other-endpoint')},{PAYMONGO_MODE:'live',PAYMONGO_SECRET_KEY:'sk_live_workerTargetFixture',PAYMONGO_LIVE_ENABLED:'false'}])('rejects unexpected worker targets or live activation: %j',patch=>{
 expect(()=>paymentWorkerTarget({...env,...patch},['--enable'])).toThrow();
});
