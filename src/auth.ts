export type AuthUser={id:string;email:string;name:string};
async function req(path:string,options:RequestInit={}) {
  const r=await fetch(path,{...options,credentials:'include',headers:{'content-type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'حدث خطأ');
  return data;
}
export const authMe=()=>req('/api/auth/me') as Promise<{user:AuthUser|null}>;
export const authRegister=(name:string,email:string,password:string)=>req('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password})}) as Promise<{user:AuthUser}>;
export const authLogin=(email:string,password:string)=>req('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})}) as Promise<{user:AuthUser}>;
export const authLogout=()=>req('/api/auth/logout',{method:'POST'}) as Promise<{ok:boolean}>;
export const cloudLoad=()=>req('/api/data') as Promise<{data:any|null;updatedAt:number}>;
export const cloudSave=(data:any)=>req('/api/data',{method:'PUT',body:JSON.stringify({data})}) as Promise<{ok:boolean;updatedAt:number}>;
