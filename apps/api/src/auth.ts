import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import { twoFactor } from 'better-auth/plugins';
import { pool, db, sql } from '@ecogrowth/db';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const previewURL=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:undefined;
export const origins=previewURL?[previewURL]:(process.env.ALLOWED_ORIGINS||'http://localhost:5173').split(',');
export const auth=betterAuth({
 database:pool,baseURL:previewURL||process.env.BETTER_AUTH_URL||'http://localhost:3001',basePath:'/api/v1/auth',secret:process.env.BETTER_AUTH_SECRET,
 trustedOrigins:[...origins,'ecogrowth://'],emailAndPassword:{enabled:true,minPasswordLength:12},
 session:{expiresIn:60*60*24,updateAge:60*60,cookieCache:{enabled:false}},
 advanced:{useSecureCookies:process.env.NODE_ENV==='production',defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}},
 rateLimit:{enabled:true,storage:'database',window:60,max:30},plugins:[expo(),twoFactor({issuer:'EcoGrowth'})]
});
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function resolveIdentity(headers:Headers){
 const bearer=headers.get('authorization');
 if(bearer?.startsWith('Bearer ')){
  const result=await db.execute(sql`SELECT u.id,u.name,u.email,n.session_id FROM native_credentials n JOIN "user" u ON u.id=n.user_id JOIN session s ON s.id=n.session_id WHERE n.access_hash=${digest(bearer.slice(7))} AND NOT n.revoked AND n.access_expires_at>now() AND s."expiresAt">now()`);
  return result.rows[0] as {id:string;name:string;email:string;session_id:string}|undefined;
 }
 const session=await auth.api.getSession({headers});return session?{...session.user,session_id:session.session.id}:undefined;
}
export async function issueNative(userId:string,sessionId:string,family=randomUUID(),tx:typeof db|any=db){
 const accessToken=randomBytes(32).toString('base64url'),refreshToken=randomBytes(48).toString('base64url');
 await tx.execute(sql`INSERT INTO native_credentials(user_id,session_id,access_hash,refresh_hash,family_id,access_expires_at,refresh_expires_at) VALUES(${userId},${sessionId},${digest(accessToken)},${digest(refreshToken)},${family},now()+interval '10 minutes',now()+interval '14 days')`);
 return {accessToken,refreshToken,expiresIn:600};
}
