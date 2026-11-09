import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Text, TextInput } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { signIn } from '../src/client';
import { useWorkspace } from '../src/context';
import { Button, Screen, Card, styles } from '../src/ui';
export default function Login(){
 const w=useWorkspace(),insets=useSafeAreaInsets();const [error,setError]=useState('');
 const {control,handleSubmit,formState:{isSubmitting}}=useForm({defaultValues:{identifier:'',password:''}});
 if(w.session?.memberships.length)return <Redirect href="/(tabs)"/>;
 return <KeyboardAvoidingView style={[styles.page,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==='ios'?'padding':undefined}><Screen>
 <Image source={require('../../../assets/EcoGrowth_Logo.png')} style={{width:210,height:70,resizeMode:'contain',marginBottom:35}} accessibilityLabel="EcoGrowth"/>
 <Text style={styles.eyebrow}>LIBERIA · OPERATIONS WORKSPACE</Text><Text style={styles.heading}>Your work. Your team.</Text><Text style={styles.text}>Use the email address or username assigned by your administrator.</Text>
 <Card>{w.loading?<Text accessibilityLiveRegion="polite">Checking session…</Text>:null}{w.session&&!w.membership?<Text style={styles.text}>Your account has no active organization membership. Contact your administrator.</Text>:null}{error?<Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>:null}
 <Text style={styles.label}>Email address or username</Text><Controller control={control} name="identifier" rules={{required:true}} render={({field})=><LoginInput label="Email address or username" value={field.value} onChange={field.onChange}/>}/>
 <Text style={styles.label}>Password</Text><Controller control={control} name="password" rules={{required:true,minLength:12,maxLength:128}} render={({field})=><LoginInput label="Password" value={field.value} onChange={field.onChange} secure/>}/>
 <Button title={isSubmitting?'Signing in…':'Sign in'} disabled={isSubmitting} onPress={handleSubmit(async data=>{setError('');try{await signIn(data.identifier,data.password);w.refetch();}catch(e){setError((e as Error).message);}})}/>
 <Text style={styles.small}>Temporary passwords must be changed before accessing records. Ask your administrator for an account or a password reset.</Text></Card></Screen></KeyboardAvoidingView>;
}
function LoginInput({label,value,onChange,secure=false}:{label:string;value:string;onChange:(value:string)=>void;secure?:boolean}){return <TextInput accessibilityLabel={label} style={styles.input} secureTextEntry={secure} autoCapitalize="none" autoComplete={secure?'current-password':'username'} maxLength={secure?128:254} value={value} onChangeText={onChange}/>;}
