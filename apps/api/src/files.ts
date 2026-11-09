import { Hono } from 'hono';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { db, sql } from '@ecogrowth/db';
import { ApiError, event, type Actor } from './access.js';
export const attachmentRoutes=new Hono<{Variables:{actor:Actor;correlationId:string}}>();
function store(){if(!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY)throw new ApiError(503,'STORAGE_UNCONFIGURED','Private evidence storage is not configured. No upload has been saved.');return new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'auto',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});}
attachmentRoutes.post('/upload-url',async c=>{
 const a=c.get('actor');if(a.role==='READ_ONLY_REVIEWER')throw new ApiError(403,'FORBIDDEN','Reviewers cannot upload evidence.');
 const d=z.object({filename:z.string().min(1).max(200),contentType:z.enum(['image/jpeg','image/png','application/pdf']),byteSize:z.number().int().min(1).max(10_000_000)}).parse(await c.req.json());
 const client=store(),id=randomUUID(),key=`${a.organizationId}/${id}`;
 const url=await getSignedUrl(client,new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,ContentType:d.contentType,ContentLength:d.byteSize}),{expiresIn:120});
 await db.transaction(async tx=>{await tx.execute(sql`INSERT INTO attachments(id,organization_id,uploader_id,object_key,filename,content_type,byte_size) VALUES(${id},${a.organizationId},${a.userId},${key},${d.filename},${d.contentType},${d.byteSize})`);await event(tx,a,'attachment-upload-requested',id);});
 return c.json({id,url,expiresIn:120,status:'UPLOAD_PENDING',note:'Upload is not review or certification.'});
});
attachmentRoutes.post('/:id/complete',async c=>{
 const a=c.get('actor');const row=(await db.execute(sql`SELECT * FROM attachments WHERE id::text=${c.req.param('id')} AND organization_id=${a.organizationId} AND uploader_id=${a.userId}`)).rows[0];if(!row)throw new ApiError(404,'NOT_FOUND','Attachment unavailable.');
 const head=await store().send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET,Key:row.object_key as string}));
 if(head.ContentLength!==Number(row.byte_size)||head.ContentType!==row.content_type)throw new ApiError(409,'UPLOAD_MISMATCH','Uploaded file does not match declared metadata.');
 await db.execute(sql`UPDATE attachments SET status='QUARANTINED' WHERE id=${row.id}`);return c.json({status:'QUARANTINED',note:'Content inspection and authorized review required before download; scanner adapter not configured.'});
});
attachmentRoutes.get('/:id/download-url',async c=>{const a=c.get('actor');const row=(await db.execute(sql`SELECT * FROM attachments WHERE id::text=${c.req.param('id')} AND organization_id=${a.organizationId} AND status='REVIEWED'`)).rows[0];if(!row)throw new ApiError(404,'NOT_FOUND','Reviewed attachment unavailable in your organization.');return c.json({url:await getSignedUrl(store(),new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:row.object_key as string,ResponseContentDisposition:'attachment'}),{expiresIn:60}),expiresIn:60});});
