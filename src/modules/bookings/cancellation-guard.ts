import type {PoolClient} from "pg";
import {DomainError} from "../partners/workflow";
export async function cancellationPending(c:PoolClient,id:string){return Boolean((await c.query("SELECT 1 FROM booking_cancellation_request r WHERE r.request_id=$1 AND NOT EXISTS(SELECT 1 FROM booking_cancellation_decision d WHERE d.cancellation_id=r.id) LIMIT 1",[id])).rowCount);}
// Caller holds the mutable request lock, shared by cancellation and progression.
export async function assertNoPendingCancellation(c:PoolClient,id:string){if(await cancellationPending(c,id))throw new DomainError("Cancellation review is pending. Resolve or withdraw it before continuing this booking.",409);}
