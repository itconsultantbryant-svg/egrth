import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { QueryClient } from '@tanstack/react-query';
export const apiURL=process.env.EXPO_PUBLIC_API_URL||'http://localhost:3001';
export const authClient=createAuthClient({baseURL:apiURL,basePath:'/api/v1/auth',plugins:[expoClient({scheme:'ecogrowth',storagePrefix:'ecogrowth',storage:SecureStore,disableCache:true})]});
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:3000,refetchInterval:5000}}});
type Credentials={accessToken:string;refreshToken:string;expiresIn:number};
let refreshing:Promise<Credentials>|undefined;
async function refresh():Promise<Credentials>{
 if(refreshing)return refreshing;
 refreshing=(async()=>{const current=await SecureStore.getItemAsync('ecogrowth.credentials');if(!current)throw new Error('Sign in again.');const response=await fetch(apiURL+'/api/v1/auth/native/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:JSON.parse(current).refreshToken})});if(!response.ok){await SecureStore.deleteItemAsync('ecogrowth.credentials');throw new Error('Session expired or revoked. Sign in again.');}const next=await response.json();await SecureStore.setItemAsync('ecogrowth.credentials',JSON.stringify(next));return next;})();
 try{return await refreshing;}finally{refreshing=undefined;}
}
export class RequestError extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
export async function request(path:string,membership?:string,body?:unknown,key?:string,retry=true):Promise<any>{
 const stored=await SecureStore.getItemAsync('ecogrowth.credentials');const token=stored?JSON.parse(stored).accessToken:undefined;
 const response=await fetch(apiURL+'/api/v1'+path,{method:body===undefined?'GET':'POST',credentials:'omit',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(membership?{'X-Membership-Id':membership}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key||randomUUID()})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(response.status===401&&stored&&retry){await refresh();return request(path,membership,body,key,false);}
 const data=await response.json();if(!response.ok)throw new RequestError(response.status,data.error?.code||'REQUEST_FAILED',data.error?.message||'Request failed');return data;
}
export async function signIn(email:string,password:string){
 const result=await authClient.signIn.email({email,password});if(result.error)throw new Error(result.error.message||'Could not sign in.');
 const cookie=await authClient.getCookie();const response=await fetch(apiURL+'/api/v1/auth/native/exchange',{method:'POST',credentials:'omit',headers:{Cookie:cookie||'','Content-Type':'application/json'}});if(!response.ok)throw new Error('Native session exchange failed.');await SecureStore.setItemAsync('ecogrowth.credentials',JSON.stringify(await response.json()));
}
export async function clearCredentials(){await SecureStore.deleteItemAsync('ecogrowth.credentials');await authClient.signOut().catch(()=>{});queryClient.clear();}
