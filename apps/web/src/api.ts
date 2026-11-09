import { QueryClient } from '@tanstack/react-query';
import { createAuthClient } from 'better-auth/react';
export const base=import.meta.env.VITE_API_URL||'';
export const authClient=createAuthClient({baseURL:base||window.location.origin,basePath:'/api/v1/auth'});
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:3000,refetchOnWindowFocus:true,refetchInterval:5000}}});
export async function api(path:string,membership?:string,body?:unknown,key?:string){
 const response=await fetch(`${base}/api/v1${path}`,{credentials:'include',headers:{...(membership?{'X-Membership-Id':membership}:{}),...(body!==undefined?{'Content-Type':'application/json','Idempotency-Key':key||crypto.randomUUID()}: {})},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok){const fields=data.error?.details?.fieldErrors;const details=fields?Object.entries(fields).map(([field,messages])=>`${field}: ${(messages as string[]).join(' ')}`).join('\n'):'';throw new Error((data.error?.message||'Request failed')+(details?'\n'+details:''));}return data;
}
