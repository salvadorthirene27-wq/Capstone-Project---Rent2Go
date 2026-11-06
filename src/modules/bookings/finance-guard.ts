import type {PoolClient} from 'pg';
import {DomainError} from '../partners/workflow';
/** Caller holds the parent request lock. Post-close changes need compensating records. */
export async function assertFinancialOpen(c:PoolClient,id:string){
 if((await c.query('SELECT 1 FROM booking_financial_close WHERE request_id=$1',[id])).rowCount)throw new DomainError('This financial record is closed. A separately reviewed financial adjustment is required.',409);
}
