import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { request, clearCredentials } from './client';
import { useWorkspace } from './context';
import { Screen, Card, Button, styles } from './ui';
export default function PasswordChange(){
 const w=useWorkspace();const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Screen><Text style={styles.heading}>Set your own password</Text><Text style={styles.text}>Change the temporary password from your administrator before accessing service records. You will sign in again afterwards.</Text><Card>{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}{[['Current temporary password',current,setCurrent],['New private password',next,setNext],['Confirm new password',confirm,setConfirm]].map(([label,value,setter])=><View key={String(label)} style={{gap:8,marginBottom:18}}><Text style={styles.label}>{String(label)}</Text><TextInput accessibilityLabel={String(label)} style={styles.input} secureTextEntry autoCapitalize="none" maxLength={128} value={String(value)} onChangeText={setter as (text:string)=>void}/></View>)}<Button title={busy?'Saving…':'Save password and sign in again'} disabled={busy} onPress={async()=>{setError('');if(next.length<12||next!==confirm){setError('Use at least 12 characters and match the confirmation.');return;}setBusy(true);try{await request('/auth/credentials/change',undefined,{currentPassword:current,newPassword:next});setCurrent('');setNext('');setConfirm('');await clearCredentials();w.refetch();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></Card></Screen>;
}
