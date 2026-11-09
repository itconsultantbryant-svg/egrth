import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Membership, Row } from '@ecogrowth/contracts';
import { can } from '@ecogrowth/domain';
import { api } from './api';
import EnquiryReview from './EnquiryReview';
export default function WebsiteInbox({membership,newsletter=false}:{membership:Membership;newsletter?:boolean}){
 const resource=newsletter?'newsletter':'enquiries';
 const [offset,setOffset]=useState(0),[selected,setSelected]=useState<string>(),[search,setSearch]=useState('');
 const q=useQuery({queryKey:[resource,membership.id,offset,search],enabled:can(membership.role,resource,'read'),queryFn:()=>api(`/${resource}?limit=20&offset=${offset}&search=${encodeURIComponent(search)}`,membership.id),refetchInterval:5000});
 if(!can(membership.role,resource,'read'))return <h1>Access not permitted</h1>;
 if(q.isError&&!q.data)return <section className="panel inbox-panel"><h1>{newsletter?'Newsletter subscribers':'Website enquiries'}</h1><p role="alert">Records could not be loaded. No empty-inbox claim can be made while the connection is unavailable.</p><button className="button secondary" onClick={()=>q.refetch()}>Retry</button></section>;
 const detail=q.data?.data.find((row:Row)=>row.id===selected);
 return <><div className="page-heading"><div><h1>{newsletter?'Newsletter subscribers':'Website enquiries'}</h1><p>{newsletter?'Consent records only. No newsletter delivery is configured.':'Public assessment requests and contact messages. No customer account is required.'}</p></div><button className="button secondary" onClick={()=>q.refetch()}>Refresh</button></div>
 <div className="panel inbox-panel"><label className="field">Search {newsletter?'subscribers':'enquiries'}<input value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);setSelected(undefined);}}/></label>
 {q.isError&&<p className="error-box" role="alert">Could not refresh. Displayed records may be stale.</p>}
 {q.isPending?<p role="status">Loading…</p>:!q.data?.data.length?<p>No {newsletter?'subscriptions':'enquiries'} found.</p>:<div className="table-scroll"><table><thead><tr>{(newsletter?['Email','Consent status','Received']:['Reference','Name / business','Contact','Type','Status','Received','Open']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{q.data.data.map((row:Row)=><tr key={row.id}>{newsletter?<><td>{row.email}</td><td>{row.status}</td><td>{new Date(row.created_at).toLocaleString()}</td></>:<><td>{row.reference}</td><td>{row.name}<br/>{row.business_name}</td><td>{row.email}<br/>{row.phone}</td><td>{row.kind}</td><td>{row.status}</td><td>{new Date(row.created_at).toLocaleString()}</td><td><button className="button secondary" onClick={()=>setSelected(row.id)}>Review {row.reference}</button></td></>}</tr>)}</tbody></table></div>}
 <div className="row wrap"><button className="button secondary" disabled={!offset} onClick={()=>{setOffset(Math.max(0,offset-20));setSelected(undefined);}}>Previous</button><button className="button secondary" disabled={!q.data?.pagination.nextOffset} onClick={()=>{setOffset(offset+20);setSelected(undefined);}}>Next</button><small>Updates every 5 seconds · {q.dataUpdatedAt?new Date(q.dataUpdatedAt).toLocaleTimeString():'Not refreshed'}</small></div></div>
 {detail&&<section className="panel inbox-panel" aria-label="Enquiry details"><h2>{detail.reference} · {detail.name}</h2><dl className="enquiry-details">{['business_name','sector','location','service','preferred_contact','message','consent_at','status','notes'].map(key=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{detail[key]||'Not provided'}</dd></div>)}</dl>{can(membership.role,'enquiries','write')&&<EnquiryReview key={`${detail.id}:${detail.version}`} row={detail} membership={membership.id}/>}<button className="button secondary" onClick={()=>setSelected(undefined)}>Close details</button></section>}</>;
}
