import "server-only";
export const localMode = () => process.env.NODE_ENV !== "production" && process.env.APP_MODE !== "production" && !process.env.SUPABASE_URL;
export function env(name:string) {const v=process.env[name]; if(!v) throw new Error(`Configuration required: ${name}`); return v;}
export const appOrigin = () => {const value=process.env.APP_URL || (localMode()?"http://127.0.0.1:3000":"");return value?new URL(value).origin:"";};
export const aiReady = () => Boolean(process.env.OPENAI_API_KEY);
export function checkProductionConfig() {
  if (process.env.NODE_ENV === "production") {
    for (const name of ["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","DATA_ENCRYPTION_KEY","APP_URL"]) env(name);
    if (!appOrigin().startsWith("https://")) throw new Error("Production requires HTTPS APP_URL");
    if (process.env.APP_MODE==="local") throw new Error("Local authentication is disabled in production");
  }
}
