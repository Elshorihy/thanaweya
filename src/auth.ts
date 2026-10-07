export type AuthUser={id:string;email:string;name:string;phone?:string|null;role?:string;verified?:boolean;subscription?:{status:string;startedAt:number|null;expiresAt:number|null;daysLeft:number}};
async function req(path:string,options:RequestInit={}) {
  const headers=new Headers(options.headers||{});
  if(options.body!==undefined && !headers.has('content-type')) headers.set('content-type','application/json');
  headers.set('accept','application/json');
  const init:RequestInit={...options,credentials:'same-origin',cache:'no-store',mode:'same-origin',headers};
  let lastError:unknown=null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetch(path,init);
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.detail?String(data.error||'حدث خطأ')+': '+String(data.detail):(data.error||'حدث خطأ'));
      return data;
    }catch(e){
      lastError=e;
      if(attempt===0 && e instanceof TypeError){await new Promise(resolve=>setTimeout(resolve,500));continue;}
      throw e;
    }
  }
  throw lastError instanceof Error?lastError:new Error('تعذر الاتصال بالخادم');
}
export const authMe=()=>req('/api/auth/me') as Promise<{user:AuthUser|null}>;
export const authRegister=(name:string,email:string,password:string,phone?:string)=>req('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password,phone})}) as Promise<{user:AuthUser}>;
export const authLogin=(email:string,password:string,phone?:string)=>req('/api/auth/login',{method:'POST',body:JSON.stringify({email,password,phone})}) as Promise<{user:AuthUser}>;
export const authRegisterStart=(name:string,email:string,password:string,phone?:string)=>req('/api/auth/register/start',{method:'POST',body:JSON.stringify({name,email,password,phone})}) as Promise<{ok:boolean;email:string}>;
export const authRegisterVerify=(email:string,code:string)=>req('/api/auth/register/verify',{method:'POST',body:JSON.stringify({email,code})}) as Promise<{user:AuthUser}>;
export const authForgotStart=(email:string)=>req(`/api/auth/forgot/start?email=${encodeURIComponent(email)}`,{method:'GET',headers:{}}) as Promise<{ok:boolean}>;
export const authResetPassword=(email:string,code:string,password:string)=>req('/api/auth/reset',{method:'POST',body:JSON.stringify({email,code,password})}) as Promise<{ok:boolean}>;
export const authLogout=()=>req('/api/auth/logout',{method:'POST'}) as Promise<{ok:boolean}>;
export const cloudLoad=()=>req('/api/data') as Promise<{data:any|null;updatedAt:number}>;
export const cloudSave=(data:any)=>req('/api/data',{method:'PUT',body:JSON.stringify({data})}) as Promise<{ok:boolean;updatedAt:number}>;
export const whatsappLoad=()=>req('/api/account/whatsapp') as Promise<{phone:string}>;
export const whatsappSave=(phone:string)=>req('/api/account/whatsapp',{method:'PUT',body:JSON.stringify({phone})}) as Promise<{ok:boolean;phone:string}>;