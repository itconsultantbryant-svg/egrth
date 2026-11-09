import { useEffect, useRef } from 'react';
import type { Session } from '@ecogrowth/contracts';
import { queryClient } from './api';
export function useAccessCacheBoundary(session:Session|undefined,failed:boolean){
 const fingerprint=failed?'unavailable':JSON.stringify({user:session?.user.id,memberships:session?.memberships,reset:session?.passwordChangeRequired});
 const prior=useRef(fingerprint);
 useEffect(()=>{if(prior.current!==fingerprint){prior.current=fingerprint;queryClient.removeQueries({predicate:q=>q.queryKey[0]!=='session'});}},[fingerprint]);
}
