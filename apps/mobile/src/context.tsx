import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session, Membership } from '@ecogrowth/contracts';
import { request } from './client';
type Workspace={session?:Session;membership?:Membership;setMembership:(id:string)=>void;loading:boolean;error:Error|null;refetch:()=>void};
const Context=createContext<Workspace>(null!);
export function WorkspaceProvider({children}:{children:ReactNode}){const [selected,setSelected]=useState('');const q=useQuery<Session>({queryKey:['session'],queryFn:()=>request('/session'),retry:false});const membership=q.data?.memberships.find(m=>m.id===selected)||q.data?.memberships.find(m=>m.role==='PLATFORM_ADMIN')||q.data?.memberships[0];return <Context.Provider value={{session:q.data,membership,setMembership:setSelected,loading:q.isPending,error:q.error,refetch:q.refetch}}>{children}</Context.Provider>;}
export const useWorkspace=()=>useContext(Context);
