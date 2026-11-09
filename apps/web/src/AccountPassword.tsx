import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, Link } from 'react-router';
import { api, queryClient } from './api';
export function OwnPasswordForm({required=false}:{required?:boolean}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);const navigate=useNavigate();
 return <main className="account-security"><img src="/logo.png" width="170" alt="EcoGrowth"/><span className="eyebrow">ACCOUNT SECURITY</span><h1>{required?'Set your own password':'Change your password'}</h1><p>{required?'Your administrator supplied a temporary password. Choose a private password before accessing service records.':'All your existing web and native sessions will be revoked. Sign in again with the new password.'}</p>
 <form onSubmit={async e=>{e.preventDefault();setError('');const form=e.currentTarget;const data=new FormData(form);if(data.get('newPassword')!==data.get('confirmPassword')){setError('New passwords do not match.');return;}setBusy(true);try{await api('/auth/credentials/change',undefined,{currentPassword:String(data.get('currentPassword')),newPassword:String(data.get('newPassword'))});form.reset();queryClient.clear();navigate('/login?password=changed',{replace:true});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>
 {error&&<div role="alert" className="error-box">{error}</div>}
 <label className="field">Current {required?'temporary ':''}password<input name="currentPassword" type="password" autoComplete="current-password" minLength={12} maxLength={128} required/></label>
 <label className="field">New private password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
 <label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><p>Use at least 12 characters. Do not reuse the temporary password or share the new one.</p>
 <button className="button primary full" disabled={busy}>{busy?'Saving…':'Save password and sign in again'}</button>
 </form>{!required&&<Link className="text-link" to="/app">Return to workspace</Link>}<button className="text-link" onClick={()=>{queryClient.clear();navigate('/login',{replace:true});}}>Return to sign in</button></main>;
}
export default function AccountPassword(){const q=useQuery({queryKey:['session'],queryFn:()=>api('/session'),retry:false});if(q.isPending)return <main className="center-state" role="status">Checking account…</main>;if(q.isError)return <Navigate to="/login" replace/>;return <OwnPasswordForm required={q.data?.passwordChangeRequired}/>;}
