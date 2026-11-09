import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session, Membership } from '@ecogrowth/contracts';
import { request, queryClient } from './client';
type Workspace={session?:Session;membership?:Membership;setMembership:(id:string)=>void;loading:boolean;error:Error|null;refetch:()=>void};
const Context=createContext<Workspace>(null!);
export function WorkspaceProvider({children}:{children:ReactNode}){const [selected,setSelected]=useState('');const q=useQuery<Session>({queryKey:['session'],queryFn:()=>request('/session'),retry:false});const fingerprint=q.isError?'unavailable':JSON.stringify(q.data?.memberships);const prior=useRef(fingerprint);useEffect(()=>{if(prior.current!==fingerprint){prior.current=fingerprint;queryClient.removeQueries({predicate:q=>q.queryKey[0]!=='session'});}},[fingerprint]);const membership=q.isError?undefined:q.data?.memberships.find(m=>m.id===selected)||q.data?.memberships.find(m=>m.role==='PLATFORM_ADMIN')||q.data?.memberships[0];return <Context.Provider value={{session:q.isError?undefined:q.data,membership,setMembership:setSelected,loading:q.isPending,error:q.error,refetch:q.refetch}}>{children}</Context.Provider>;}
export const useWorkspace=()=>useContext(Context);
