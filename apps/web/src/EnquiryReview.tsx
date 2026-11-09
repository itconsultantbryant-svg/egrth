import { useState } from 'react';
import type { Row } from '@ecogrowth/contracts';
import { api, queryClient } from './api';
export default function EnquiryReview({row,membership}:{row:Row;membership:string}){
 const [status,setStatus]=useState(row.status),[notes,setNotes]=useState(row.notes||''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <form className="enquiry-review" onSubmit={async e=>{
  e.preventDefault();setBusy(true);setMessage('');
  try{await api(`/enquiries/${row.id}/review`,membership,{version:row.version,status,notes});await queryClient.invalidateQueries();setMessage('Follow-up saved. Reopen Details to review the latest version.');}
  catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }}><h3>Record follow-up</h3><p><a className="text-link" href={`mailto:${row.email}`}>Email {row.name}</a>{row.phone&&<> · <a className="text-link" href={`tel:${String(row.phone).replace(/[^+\d]/g,'')}`}>Call {row.phone}</a></>}</p>
 <label className="field">Follow-up status<select value={status} onChange={e=>setStatus(e.target.value)}><option>NEW</option><option>CONTACTED</option><option>CLOSED</option></select></label>
 <label className="field">Private follow-up notes<textarea required minLength={5} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
 <button className="button primary" disabled={busy}>{busy?'Saving…':'Save follow-up'}</button><p role="status">{message}</p></form>;
}
