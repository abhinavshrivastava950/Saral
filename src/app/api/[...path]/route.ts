import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { identity,localLogin,logout,requireIdentity,sendMagicLink } from "@/server/auth";
import { aiReady,checkProductionConfig,localMode } from "@/server/config";
import { AppError } from "@/server/errors";
import { boundedBody,jsonBody,multipartBody,rateLimit,verifyOrigin } from "@/server/security";
import { audit,auditEvent,auditSummary,deleteDraft,getFiling,getProfile,listDocuments,listFilings,saveFiling,saveProfile } from "@/server/repository";
import { assertEditable,confirmReview,confirmChatReview,createFiling,submitFiling,updateFiling,viewFiling } from "@/server/filings";
import { sendChatMessage,connectChatRecords } from "@/server/chat";
import { recordConnectionsConfigured } from "@/server/records";
import { effectiveProfile } from "@/lib/chat";
import { understanding } from "@/server/ai";
import { registerDocument,removeDocument,purgeExpired } from "@/server/documents";
import { eri,preparationPacket } from "@/server/eri";
import { profileSchema } from "@/lib/domain";
import { preparationIssues } from "@/lib/validation";
import {startDemo,fetchDemo,submitDemo,verifyDemo,requireDemo} from "@/server/demo";
import {geminiReady} from "@/server/gemini";
import {openaiVoiceReady,transcribeOpenAI,speakOpenAI} from "@/server/openai-voice";
import {voiceLanguageSchema,voiceGreeting,voiceReply} from "@/lib/voice-language";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{path:string[]}>};
async function handler(request:Request,context:Context){
  const requestId=randomUUID();
  let actorId:string|undefined;
  const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store, private","X-Request-Id":requestId,"Pragma":"no-cache"}});
  try {
    const {path}=await context.params;const method=request.method;const route=path.join("/");
    if(route==="health"&&method==="GET")return response({status:"ok",version:"0.1.0"});
    if(route==="session"&&method==="GET")return response({user:await identity(),mode:localMode()?"local":"production",demoAvailable:localMode(),voiceConfigured:openaiVoiceReady(),voiceProvider:"openai",geminiConfigured:geminiReady(),aiConfigured:aiReady(),authConfigured:localMode()||Boolean(process.env.SUPABASE_URL),eriConfigured:eri().mode==="official",recordsConfigured:recordConnectionsConfigured(),serviceFee:21});
    checkProductionConfig();
    if(method!=="GET")verifyOrigin(request);
    if(route==="demo/start"&&method==="POST"){
      requireDemo();const body=z.object({scenario:z.enum(["complete","missing-interest"]),consent:z.literal(true)}).strict().parse(await jsonBody(request));
      const user=await localLogin();actorId=user.id;await rateLimit(user.id,"demo_start",15,3600);
      return response(await viewFiling(await startDemo(user.id,body.scenario,requestId)),201);
    }
    if(route==="auth/local"&&method==="POST") {const body=z.object({sampleDataOnly:z.literal(true)}).parse(await jsonBody(request));void body;await rateLimit("local","login",20);return response({user:await localLogin()});}
    if(route==="auth/magic-link"&&method==="POST") {
      const {email}=z.object({email:z.email().max(254)}).parse(await jsonBody(request));
      await rateLimit("global","auth_total",100,3600);await rateLimit(email.toLowerCase(),"auth_email",4,900);
      if(localMode())throw new AppError(503,"auth_not_configured","Email sign-in needs a configured Supabase project. Try the local sample workspace.");
      await sendMagicLink(email);return response({message:"If this address can receive email, a sign-in link is on its way."});
    }
    const user=await requireIdentity();actorId=user.id;await rateLimit(user.id,"requests",120,60);
    if(route==="auth/logout"&&method==="POST"){await audit(auditEvent(user.id,null,"session.ended",requestId));await logout();return response({ok:true});}
    if(route==="profile"){
      if(method==="GET")return response({profile:await getProfile(user.id)});
      if(method==="PATCH"){
        const raw=await jsonBody(request);
        if(typeof raw!=="object"||raw===null||!Object.keys(profileSchema.shape).every(key=>Object.hasOwn(raw,key)))throw new AppError(400,"complete_profile_required","Review and send the complete profile; omitted fields will not be cleared silently.");
        const profile=profileSchema.strict().parse(raw);await saveProfile(user.id,profile,requestId);return response({profile});
      }
    }
    if(route==="audit"&&method==="GET")return response({events:await auditSummary(user.id)});
    if(route==="admin"&&method==="GET"){
      if(!user.admin)throw new AppError(403,"admin_required","This page is restricted to authorized administrators.");
      return response({events:await auditSummary(user.id,true),services:{ai:aiReady(),eri:eri().mode,storage:localMode()?"local":"supabase",feeCollection:"disabled"}});
    }
    if(route==="documents"&&method==="GET"){await purgeExpired(user.id,requestId);const documents=await listDocuments(user.id);return response({documents:documents.map(({storagePath:_,...d})=>d)});}
    if(path[0]==="documents"&&path.length===2&&method==="DELETE"){await removeDocument(user.id,z.uuid().parse(path[1]),requestId);return response({ok:true});}
    if(route==="filings"){
      if(method==="GET")return response({filings:await listFilings(user.id)});
      if(method==="POST"){
        z.object({processingConsent:z.literal(true)}).strict().parse(await jsonBody(request));await rateLimit(user.id,"new_filing",10,3600);
        return response(await viewFiling(await createFiling(user.id,requestId)),201);
      }
    }
    if(path[0]==="filings"&&path.length>=2){
      const id=z.uuid().parse(path[1]);const filing=await getFiling(user.id,id);const action=path[2];
      if(filing.demo&&["submit","prefill","e-verify","acknowledgement","connect-records","upload","understand"].includes(action))throw new AppError(403,"demo_isolated","Demo records cannot access official filing or taxpayer-data services.");
      if(path.length===3&&["demo-fetch","demo-submit","demo-verify"].includes(action)&&method==="POST"){
        requireDemo(filing);
        const body=z.object({revision:z.number().int(),confirmed:z.literal(true),hash:z.string().length(64).optional()}).strict().parse(await jsonBody(request));
        if(body.revision!==filing.revision)throw new AppError(409,"revision_conflict","This demo changed. Refresh before continuing.");
        const next=action==="demo-fetch"?await fetchDemo(filing,requestId):action==="demo-submit"?await submitDemo(filing,body.hash??"",requestId):await verifyDemo(filing,requestId);
        return response(await viewFiling(next));
      }
      if(path.length===3&&action==="demo-receipt"&&method==="GET"){
        requireDemo(filing);if(!filing.demo!.acknowledgement)throw new AppError(409,"demo_incomplete","Complete the simulated verification before downloading the demo receipt.");
        const view=await viewFiling(filing);
        return new Response(JSON.stringify({title:"DEMO ACKNOWLEDGEMENT — NOT AN OFFICIAL TAX RECEIPT",simulated:true,actuallyFiled:false,notice:"No Income Tax Department API was called. No real return was filed, refund initiated or payment made.",acknowledgement:filing.demo!.acknowledgement,assessmentYear:filing.year,taxpayer:"Aarav Sharma — fictional profile",calculation:view.estimates?.[filing.regime]},null,2),{headers:{"content-type":"application/json","content-disposition":'attachment; filename="SARAL-DEMO-NOT-FILED.json"',"cache-control":"no-store"}});
      }
      if(path.length===3&&action==="speech"&&method==="POST"){
        const body=z.object({text:z.string().trim().min(1).max(2200),aiConsent:z.literal(true),language:voiceLanguageSchema.optional()}).strict().parse(await jsonBody(request));
        await rateLimit(user.id,"speech",60,3600);await audit(auditEvent(user.id,id,"voice.synthesis_consented",requestId));
        const speech=await speakOpenAI(body.text,body.language??"auto");
        return new Response(speech.bytes as BodyInit,{headers:{"content-type":speech.mime,"cache-control":"no-store, private","X-Content-Type-Options":"nosniff","X-Voice-Provider":"openai"}});
      }
      if(path.length===3&&action==="voice-context"&&method==="POST"){
        const body=z.object({aiConsent:z.literal(true),language:voiceLanguageSchema}).strict().parse(await jsonBody(request));
        const view=await viewFiling(filing);
        return response({greeting:voiceGreeting(filing,view.chatQuestion,body.language),filingId:filing.id,revision:filing.revision});
      }
      if(path.length===3&&action==="chat"&&method==="POST"){
        const body=z.object({text:z.string().trim().min(1).max(6000),aiConsent:z.boolean(),revision:z.number().int(),inputMode:z.enum(["text","voice"]).optional(),voiceLanguage:voiceLanguageSchema.optional()}).strict().parse(await jsonBody(request));
        if(body.revision!==filing.revision)throw new AppError(409,"revision_conflict","This conversation changed in another tab. Refresh to continue.");
        await rateLimit(user.id,"ai",25,3600);
        const updated=await sendChatMessage(filing,body.text,body.aiConsent,await getProfile(user.id),requestId,body.voiceLanguage??"auto");
        const view=await viewFiling(updated);
        if(body.inputMode==="voice"){
          const reply=voiceReply(filing,updated,view.chatQuestion,body.voiceLanguage??"hi",body.text);
          return response({...view,voiceReply:reply.text,voiceChanges:reply.changes});
        }
        return response(view);
      }
      if(path.length===3&&action==="connect-records"&&method==="POST"){
        const body=z.object({consent:z.literal(true),revision:z.number().int()}).strict().parse(await jsonBody(request));
        if(body.revision!==filing.revision)throw new AppError(409,"revision_conflict","Refresh this conversation before reconnecting.");
        await rateLimit(user.id,"records",10,3600);
        return response(await viewFiling(await connectChatRecords(filing,await getProfile(user.id),requestId)));
      }
      if(path.length===3&&action==="chat-review"&&method==="POST"){
        const body=z.object({confirmed:z.literal(true),hash:z.string().length(64)}).strict().parse(await jsonBody(request));
        return response(await viewFiling(await confirmChatReview(filing,body.hash,requestId)));
      }
      if(path.length===2){
        if(method==="GET")return response(await viewFiling(filing));
        if(method==="PATCH")return response(await viewFiling(await updateFiling(filing,await jsonBody(request),requestId)));
        if(method==="DELETE"){
          assertEditable(filing);for(const doc of await listDocuments(user.id))if(doc.filingId===id)await removeDocument(user.id,doc.id,requestId);
          await deleteDraft(user.id,id,requestId);return response({ok:true});
        }
      }
      if(path.length===3&&action==="understand"&&method==="POST"){
        assertEditable(filing);const body=z.object({text:z.string().trim().min(1).max(6000),aiConsent:z.literal(true),revision:z.number().int()}).parse(await jsonBody(request));
        if(body.revision!==filing.revision)throw new AppError(409,"revision_conflict","Reload this return before adding another answer.");
        await rateLimit(user.id,"ai",15,3600);
        await audit(auditEvent(user.id,id,"ai.processing_consented",requestId));
        const proposal=await understanding().understand(body.text);
        const next=await saveFiling({...filing,pending:proposal,aiConsentAt:new Date().toISOString(),revision:filing.revision+1,updatedAt:new Date().toISOString()},filing.revision,auditEvent(user.id,id,"ai.proposal_created",requestId));
        return response(await viewFiling(next));
      }
      if(path.length===3&&action==="upload"&&method==="POST"){
        assertEditable(filing);await rateLimit(user.id,"ai",15,3600);
        const form=await multipartBody(request);const file=form.get("file");
        if(form.get("aiConsent")!=="true")throw new AppError(400,"consent_required","Consent to AI processing is required before extraction.");
        if(Number(form.get("revision"))!==filing.revision)throw new AppError(409,"revision_conflict","Reload this return before adding a document.");
        if(!(file instanceof File))throw new AppError(400,"file_required","Choose a salary document.");
        const provider=understanding();await audit(auditEvent(user.id,id,"ai.document_processing_consented",requestId));
        const {bytes,mime}=await registerDocument(user.id,id,file,form.get("retain")==="true",requestId);
        const proposal=await provider.understand("Read the attached document for FY 2025-26. Return only a proposed salary worksheet.",{bytes,mime});
        const next=await saveFiling({...filing,pending:proposal,aiConsentAt:new Date().toISOString(),revision:filing.revision+1,updatedAt:new Date().toISOString()},filing.revision,auditEvent(user.id,id,"document.extracted",requestId));
        return response(await viewFiling(next));
      }
      if(path.length===3&&action==="transcribe"&&method==="POST"){
        assertEditable(filing);await rateLimit(user.id,"voice",15,3600);const form=await multipartBody(request);const audio=form.get("audio");
        if(form.get("aiConsent")!=="true")throw new AppError(400,"consent_required","Consent is required for audio processing.");
        if(!(audio instanceof File)||audio.size<1||audio.size>8*1024*1024||!/^audio\/(webm|mp4|mpeg|wav|ogg)/.test(audio.type))throw new AppError(415,"invalid_audio","Record an answer of up to 60 seconds, in a supported browser.");
        const language=voiceLanguageSchema.parse(form.get("language")??"auto");
        await audit(auditEvent(user.id,id,"voice.processing_consented",requestId));const text=await transcribeOpenAI(audio,language);
        return response({text,provider:"openai",notice:"Audio is not stored by Saral. The transcript is used to update the draft; final review remains explicit."});
      }
      if(path.length===3&&action==="prefill"&&method==="POST"){
        assertEditable(filing);z.object({consent:z.literal(true)}).strict().parse(await jsonBody(request));const profile=await getProfile(user.id);
        if(!profile.pan)throw new AppError(422,"pan_required","Add your PAN to your profile before requesting official prefill.");
        const adapter=eri();if(adapter.mode!=="official")throw new AppError(503,"prefill_unavailable","Official prefill is not connected. No Income Tax account was accessed.");
        const consentAt=new Date().toISOString();await audit(auditEvent(user.id,id,"prefill.consented",requestId));await adapter.authenticate();await adapter.addClient({taxpayer:profile,consentAt});
        const prefill=await adapter.getPrefill({taxpayer:profile,consentAt});
        const next=await saveFiling({...filing,prefill:prefill.fields,prefillSource:prefill.source,prefillConsentAt:consentAt,reviewHash:null,reviewConfirmedAt:null,status:"draft",revision:filing.revision+1,updatedAt:consentAt},filing.revision,auditEvent(user.id,id,"prefill.received",requestId));return response(await viewFiling(next));
      }
      if(path.length===3&&action==="review"&&method==="POST"){
        const {confirmed,hash}=z.object({confirmed:z.literal(true),hash:z.string().length(64)}).strict().parse(await jsonBody(request));void confirmed;
        return response(await viewFiling(await confirmReview(filing,hash,requestId)));
      }
      if(path.length===3&&action==="validate"&&method==="POST")return response(await viewFiling(filing));
      if(path.length===3&&action==="submit"&&method==="POST"){
        const body=z.object({confirmSubmission:z.literal(true),hash:z.string().length(64)}).strict().parse(await jsonBody(request));
        return response(await viewFiling(await submitFiling(filing,body.hash,requestId)));
      }
      if(path.length===3&&action==="payment"&&method==="POST")throw new AppError(503,"payment_unavailable","The ₹21 service fee is proposed. Payment collection is not enabled; you have not been charged.");
      if(path.length===3&&action==="e-verify"&&method==="POST"){
        if(!filing.officialReference||!["submitted","verification_pending"].includes(filing.status))throw new AppError(409,"submission_required","There is no official submission to verify.");
        const result=await eri().eVerify({reference:filing.officialReference,method:"redirect"});
        if(result.redirectUrl){const allowed=(process.env.ERI_REDIRECT_HOSTS??"").split(",");const u=new URL(result.redirectUrl);if(u.protocol!=="https:"||!allowed.includes(u.hostname))throw new AppError(502,"unsafe_redirect","The verification link could not be validated.");}
        await saveFiling({...filing,status:"verification_pending",revision:filing.revision+1,updatedAt:new Date().toISOString()},filing.revision,auditEvent(user.id,id,"verification.requested",requestId));return response(result);
      }
      if(path.length===3&&action==="acknowledgement"&&(method==="GET"||method==="POST")){
        if(!filing.officialReference)throw new AppError(404,"not_filed","No official acknowledgement exists. This return has not been submitted.");
        if(filing.acknowledgement)return response({acknowledgement:filing.acknowledgement});
        if(method==="GET")return response({acknowledgement:null,status:"pending"},202);
        const ack=await eri().getAcknowledgement(filing.officialReference);const acknowledgement={number:ack.number,receivedAt:ack.receivedAt};
        await saveFiling({...filing,acknowledgement,status:"verified",revision:filing.revision+1,updatedAt:new Date().toISOString()},filing.revision,auditEvent(user.id,id,"acknowledgement.officially_received",requestId));return response({acknowledgement});
      }
      if(path.length===3&&action==="export"&&method==="GET"){
        if(preparationIssues(filing).some(i=>i.severity==="error"))throw new AppError(422,"incomplete_return","Complete and confirm your worksheet before downloading it.");
        await audit(auditEvent(user.id,id,"worksheet.exported",requestId));
        return new Response(JSON.stringify(preparationPacket(filing,effectiveProfile(filing,await getProfile(user.id))),null,2),{headers:{"Content-Type":"application/json","Content-Disposition":'attachment; filename="saral-salary-worksheet-2026-27.json"',"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});
      }
    }
    throw new AppError(404,"not_found","This action is not available.");
  }catch(error){
    if(error instanceof ZodError)return response({error:"Please check the highlighted values. Amounts must be valid, non-negative rupees.",code:"invalid_input",fields:error.issues.map(i=>({path:i.path.join("."),message:i.message})),requestId},400);
    const expected=error instanceof AppError;const status=expected?error.status:500;
    // Deliberately omit request bodies, identifiers, provider errors and stack traces from operational logs.
    const diagnostic=(error as {code?:unknown})?.code;
    const safeDiagnostic=typeof diagnostic==="string"&&/^[A-Z_0-9]+$/.test(diagnostic)?diagnostic:undefined;
    console[status>=500?"error":"warn"](JSON.stringify({event:"api_failure",requestId,code:expected?error.code:"internal_error",status,diagnostic:safeDiagnostic}));
    if(actorId){try{await audit(auditEvent(actorId,null,"request.failed",requestId,{status,code:expected?error.code:"internal_error"}));}catch{/* Operational logs remain available when audit storage itself is down. */}}
    return response({error:expected?error.message:"We could not complete this step. Your information has not been silently changed. Please retry.",code:expected?error.code:"internal_error",requestId},status);
  }
}
export const GET=handler;export const POST=handler;export const PATCH=handler;export const DELETE=handler;
