import { randomUUID } from "node:crypto";
import { safeEqual } from "@/server/crypto";
import { database,expiredDocuments } from "@/server/repository";
import { removeDocument } from "@/server/documents";
import { localMode } from "@/server/config";
export const runtime="nodejs";
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<32||!safeEqual(request.headers.get("authorization")??"",`Bearer ${secret}`))return Response.json({error:"Unauthorized"},{status:401});
  const requestId=randomUUID();let deleted=0;
  try{for(const doc of await expiredDocuments()){await removeDocument(doc.ownerId,doc.id,requestId);deleted++;}
    if(!localMode()){const {error}=await database().from("rate_limits").delete().lt("expires_at",new Date().toISOString());if(error)throw new Error("Rate cleanup failed");}
    return Response.json({deleted,requestId},{headers:{"Cache-Control":"no-store"}});
  }catch{console.error(JSON.stringify({event:"retention_cleanup_failed",requestId}));return Response.json({error:"Cleanup failed; retry and investigate",requestId},{status:500});}
}
