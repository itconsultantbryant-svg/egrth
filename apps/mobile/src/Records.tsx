import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Resource, Row } from '@ecogrowth/contracts';
import { can, kg, money } from '@ecogrowth/domain';
import { labels } from '@ecogrowth/domain/navigation';
import { createAction, rowActions, type Action } from '@ecogrowth/domain/workflows';
import { useWorkspace } from './context';
import { request, RequestError } from './client';
import { cacheJobs, cachedJobs } from './offline';
import { Screen, Card, Button, Status, styles } from './ui';
export function openAction(action:Action){router.push({pathname:'/action',params:{definition:JSON.stringify(action)}});}
export default function Records({resource}:{resource:Resource}){
 const w=useWorkspace();const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[detail,setDetail]=useState('');
 const scope={userId:w.session?.user.id||'',membershipId:w.membership?.id||''};
 const list=useQuery({queryKey:['records',resource,scope.membershipId,offset,search],enabled:!!w.membership&&can(w.membership.role,resource,'read'),queryFn:async()=>{
  try{const result=await request(`/${resource}?limit=25&offset=${offset}&search=${encodeURIComponent(search)}`,scope.membershipId);if(resource==='jobs'&&w.membership?.role==='COLLECTOR'&&offset===0&&!search)await cacheJobs(scope,result.data);return {...result,offline:false};}
  catch(e){if(resource==='jobs'&&w.membership?.role==='COLLECTOR'&&!(e instanceof RequestError)){const data=await cachedJobs(scope);return {data,offline:true,pagination:{nextOffset:null}};}throw e;}
 },refetchInterval:5000});
 const calendar=useQuery({queryKey:['schedule-calendar',scope.membershipId,detail],enabled:resource==='schedules'&&!!detail&&!!w.membership&&can(w.membership.role,'schedules','read'),queryFn:()=>request(`/schedules/${detail}/calendar`,scope.membershipId),refetchInterval:5000});
 const q={...list,data:list.data?{...list.data,data:list.data.data.map((row:Row)=>{
  const record=resource==='settings'?{...row,id:row.key}:row;
  return resource==='schedules'&&record.id===detail?{...record,calendar:calendar.data?.calendar||(calendar.error?{error:calendar.error.message}:'Loading authorized calendar details…')}:record;
 })}:undefined};
 if(!w.membership)return <Screen><Text>Choose an authorized membership.</Text></Screen>;
 if(!can(w.membership.role,resource,'read'))return <Screen><Text style={styles.error}>Access is not permitted for this role.</Text></Screen>;
 const create=createAction(resource,w.membership.role);
 return <Screen><Text style={styles.heading}>{labels[resource]}</Text><Text style={styles.small}>{w.membership.organizationName} · {q.data?.offline?'OFFLINE CACHE · up to 24 hours old; not current server confirmation':'Scoped online polling · every 5 seconds'}</Text>{create?<Button title={create.title} onPress={()=>openAction(create)}/>:null}<TextInput accessibilityLabel="Search authorized records" style={styles.input} placeholder="Search these records" value={search} onChangeText={s=>{setSearch(s);setOffset(0);}}/>{q.isPending?<Text accessibilityLiveRegion="polite">Loading records…</Text>:null}{q.isError?<Card><Text style={styles.error} accessibilityRole="alert">{q.error.message}</Text><Button title="Retry" secondary onPress={()=>q.refetch()}/></Card>:null}{q.data?.data.length===0?<Card><Text style={styles.title}>No records in this scope</Text><Text style={styles.text}>Nothing has been invented to fill this view.</Text></Card>:null}{q.data?.data.map((row:Row)=><Card key={row.id||row.key}><Text style={styles.title}>{row.reference||row.name||row.subject||row.title||row.action||String(row.id||row.key).slice(0,12)}</Text>{row.state||row.status?<Status value={row.state||row.status}/>:null}{row.net_grams!==undefined?<Text style={styles.text}>{kg(Number(row.net_grams))} kg · {row.measurement}</Text>:null}{row.total_minor!==undefined?<Text style={styles.text}>{money(Number(row.total_minor),row.currency)} · {money(Number(row.paid_minor),row.currency)} confirmed allocation</Text>:null}{row.occurrence_date?<Text style={styles.text}>Service date: {String(row.occurrence_date).slice(0,10)}</Text>:null}{row.message?<Text style={styles.text}>{row.message}</Text>:null}<Text selectable style={styles.small}>ID: {row.id}</Text><Button title={detail===row.id?'Hide all fields':'Show all fields / related IDs'} secondary onPress={()=>setDetail(detail===row.id?'':row.id)}/>{detail===row.id?Object.entries(row).map(([key,value])=><View key={key} style={{gap:3,marginVertical:3}}><Text style={styles.label}>{key.replaceAll('_',' ')}</Text><Text selectable style={styles.small}>{typeof value==='object'?JSON.stringify(value):String(value??'Not recorded')}</Text></View>):null}{rowActions(resource,row,w.membership!.role,w.session!.user.id).map(action=><Button key={action.name+action.title} title={action.title} onPress={()=>openAction(action)}/>)}</Card>)}{['batches','payables','containers','users','settings'].includes(resource)?<Card><Text style={styles.title}>Read-only foundation</Text><Text style={styles.text}>This management module is not release-complete. Refer to the phase checklist; no provider or treatment success is implied.</Text></Card>:null}<View style={styles.row}><Button title="Previous page" secondary disabled={offset===0} onPress={()=>setOffset(Math.max(0,offset-25))}/><Button title="Next page" secondary disabled={!q.data?.pagination.nextOffset} onPress={()=>setOffset(offset+25)}/></View><Text style={styles.small}>Separate stage weights must not be added as total recovery. Saved pickup evidence does not establish receiving or composting.</Text></Screen>;
}
