import { useState } from 'react';
import { Text, View, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { navigation, labels } from '@ecogrowth/domain/navigation';
import { useWorkspace } from '../../src/context';
import { request, clearCredentials, queryClient } from '../../src/client';
import { queue, sync, releaseDraft, clearLocalUser } from '../../src/offline';
import { Screen, Card, Button, Status, styles } from '../../src/ui';
export default function More(){
 const w=useWorkspace();const [showQueue,setShowQueue]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const scope={userId:w.session?.user.id||'',membershipId:w.membership?.id||''};
 const q=useQuery({queryKey:['queue',scope.membershipId],queryFn:()=>queue(scope),enabled:showQueue&&!!scope.userId,refetchInterval:5000});
 return <Screen><Text style={styles.heading}>Your workspace</Text><Text style={styles.text}>{w.session?.user.name} · {w.membership?.role.replaceAll('_',' ')}</Text>
 <Card><Text style={styles.title}>Switch organization / role</Text>{w.session?.memberships.map(m=><Button key={m.id} title={`${m.id===w.membership?.id?'Selected: ':''}${m.organizationName} · ${m.role.replaceAll('_',' ')}`} secondary={m.id!==w.membership?.id} onPress={()=>{queryClient.removeQueries({predicate:q=>q.queryKey[0]!=='session'});w.setMembership(m.id);setShowQueue(false);router.replace('/(tabs)');}}/>)}</Card>
 {w.membership&&navigation(w.membership.role,w.membership.deniedPermissions).map(group=><Card key={group.name}><Text style={styles.eyebrow}>{group.name}</Text>{group.items.map(resource=><Button key={resource} title={labels[resource]} secondary onPress={()=>router.push({pathname:'/records/[resource]',params:{resource}})}/>)}</Card>)}
 {w.membership?.role==='COLLECTOR'?<Card><Button title={showQueue?'Hide sync queue':'Open sync queue'} secondary onPress={()=>setShowQueue(!showQueue)}/>{showQueue?<>
  <Text style={styles.title}>Device-local sync queue</Text><Text style={styles.small}>Draft / Queued / Syncing are not confirmed pickups. Needs Review retains your evidence; contact dispatch and create a new reviewed capture rather than forcing stale weights.</Text>
  {q.error?<Text style={styles.error}>{q.error.message}</Text>:null}{q.data?.map(item=><View key={item.id} style={{gap:10,borderTopWidth:1,borderColor:'#E2E8F0',paddingTop:15}}><Status value={item.state}/><Text selectable style={styles.small}>{item.id}</Text><Text style={styles.text}>{item.message}</Text><Text selectable style={styles.small}>{item.payload}</Text>{item.state==='Draft'?<Button title="Queue draft for server validation" secondary onPress={async()=>{await releaseDraft(scope,item.id);q.refetch();}}/>:null}</View>)}
  {q.data?.length===0?<Text>No device-local records for this user and membership.</Text>:null}<Button title={busy?'Synchronizing…':'Sync queued records now'} disabled={busy} onPress={async()=>{setBusy(true);try{await sync(scope);await q.refetch();await queryClient.invalidateQueries();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
 </>:null}</Card>:null}
 {error?<Text style={styles.error} accessibilityRole="alert">{error}</Text>:null}<Button title="Sign out and clear local user data" secondary onPress={()=>Alert.alert('Sign out?','Device-local drafts will be deleted. Sync or copy unresolved evidence first.',[{text:'Cancel',style:'cancel'},{text:'Sign out',style:'destructive',onPress:async()=>{try{await request('/logout',w.membership?.id,{});}catch{}try{if(w.session)await clearLocalUser(w.session.user.id);}catch{setError('Local cleanup failed. Remain signed in until device data is safely removed.');return;}await clearCredentials();w.refetch();router.replace('/');}}])}/>
 <Text style={styles.small}>User provisioning and password resets are managed in the web administrator workspace. Native push, scanning and attachment retry are not activated. Exports do not establish signed/device-test success.</Text></Screen>;
}
