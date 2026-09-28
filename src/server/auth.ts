import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { appOrigin,env,localMode } from "./config";
import { safeEqual,sign } from "./crypto";
import { AppError } from "./errors";
export type Identity={id:string;email:string;admin:boolean;local:boolean};
export async function supabaseAuth() {
  const jar=await cookies();
  return createServerClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{cookies:{getAll:()=>jar.getAll(),setAll:values=>{for(const {name,value,options}of values)jar.set(name,value,{...options,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});}}});
}
export async function identity():Promise<Identity|null> {
  if(localMode()) {
    const token=(await cookies()).get("saral_local")?.value;if(!token)return null;
    const [body,signature]=token.split(".");if(!body||!signature||!safeEqual(signature,await sign(body)))return null;
    try{const p=JSON.parse(Buffer.from(body,"base64url").toString());if(typeof p.id!=="string"||p.expires<Date.now())return null;return {id:p.id,email:"Local sample workspace",admin:false,local:true};}catch{return null;}
  }
  if(!process.env.SUPABASE_URL)return null;
  const {data:{user},error}=await (await supabaseAuth()).auth.getUser();if(error||!user)return null;
  return {id:user.id,email:user.email??"",admin:user.app_metadata?.role==="admin",local:false};
}
export async function requireIdentity() {const user=await identity();if(!user)throw new AppError(401,"authentication_required","Sign in to open your secure workspace.");return user;}
export async function localLogin() {
  if(!localMode())throw new AppError(403,"local_disabled","Local sign-in is disabled.");
  const existing=await identity();if(existing)return existing;
  const id=randomUUID();const expires=Date.now()+8*3600_000;const body=Buffer.from(JSON.stringify({id,expires})).toString("base64url");
  (await cookies()).set("saral_local",body+"."+await sign(body),{httpOnly:true,sameSite:"strict",secure:false,path:"/",maxAge:8*3600});
  return {id,email:"Local sample workspace",admin:false,local:true};
}
export async function sendMagicLink(email:string) {
  const client=await supabaseAuth();const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:appOrigin()+"/auth/callback"}});
  if(error)throw new AppError(503,"sign_in_unavailable","We could not send the sign-in link. Please try again shortly.");
}
export async function logout(){if(localMode())(await cookies()).delete("saral_local");else await (await supabaseAuth()).auth.signOut();}
