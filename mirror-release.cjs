'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const expectedPackage='ph.catanduanes.islahanda.prototype',expectedSigner='0003e79050aae4840c00b0c15143aa360ceb063da87161cee20510c893fc1a9a';
const manifestUrl='https://drive.usercontent.google.com/download?id=1sM8gVgIEAQzTa56qiWrIjOSZB3tvAnDf&export=download&confirm=t';
function validateManifest(m){
 if(m.schemaVersion!==1||m.enabled!==true||m.applicationId!==expectedPackage||m.signerSha256!==expectedSigner||!Number.isSafeInteger(m.versionCode)||m.versionCode<82||!/^\d+\.\d+\.\d+$/.test(m.versionName)||!/^[-\w]{10,200}$/.test(m.apkFileId)||!/^([a-f0-9]{64})$/.test(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<1000000||m.bytes>268435456)throw Error('Unapproved or invalid Android release manifest.');
 return m;
}
function compareLatest(latest,m){
 if(!latest)return;
 const match=(latest.body||'').match(/islahanda-version-code:(\d+)/);
 if(!match)throw Error('Existing latest release has no approved version-code marker.');
 const code=Number(match[1]);if(code>m.versionCode)throw Error('Drive manifest is older than the current GitHub release; no downgrade was published.');
 if(code===m.versionCode&&latest.tag_name!=='v'+m.versionName)throw Error('Release version name conflicts with an existing version code.');
 if(code===m.versionCode&&!(latest.body||'').includes('SHA-256: `'+m.sha256+'`'))throw Error('An existing version code has different APK bytes.');
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function publicBytes(url,expectedSize,expectedSha){
 const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Public download failed: HTTP '+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==expectedSize||sha(bytes)!==expectedSha)throw Error('Downloaded bytes do not match the approved APK.');return bytes;
}
function verifyAndroid(file,m){
 const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;if(!sdk)throw Error('Android SDK is required for signing verification.');
 const folders=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 const tools=folders.map(n=>path.join(sdk,'build-tools',n)).find(p=>fs.existsSync(path.join(p,'lib','apksigner.jar')));if(!tools)throw Error('Android APK verification tools are unavailable.');
 const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
 const certificates=execFileSync(java,['-jar',path.join(tools,'lib','apksigner.jar'),'verify','--print-certs',file],{encoding:'utf8'});
 const signatures=[...new Set(Array.from(certificates.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/gi),m=>m[1].toLowerCase()))];
 const info=execFileSync(path.join(tools,process.platform==='win32'?'aapt.exe':'aapt'),['dump','badging',file],{encoding:'utf8'});
 const identity=info.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
 if(signatures.length!==1||signatures[0]!==expectedSigner||!identity||identity[1]!==expectedPackage||Number(identity[2])!==m.versionCode||identity[3]!==m.versionName)throw Error('APK signing identity, package or version does not match the approved release.');
}
async function main(){
 const repo=process.env.GH_REPO||'KhenQ/islahanda-download';if(repo!=='KhenQ/islahanda-download')throw Error('Unexpected public download repository.');
 const verifyOnly=process.env.ISLAHANDA_VERIFY_ONLY==='1',token=process.env.GH_TOKEN;
 if(!verifyOnly&&!token)throw Error('GitHub workflow token is missing.');
 const m=validateManifest(await (await fetch(manifestUrl,{signal:AbortSignal.timeout(60000)})).json());
 const api='https://api.github.com/repos/'+repo;
 async function github(route,method='GET',body){
  const r=await fetch(api+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  if(r.status===404&&method==='GET')return null;if(!r.ok)throw Error('GitHub '+method+' failed: HTTP '+r.status);return r.json();
 }
 let latest=null,release=null;const tag='v'+m.versionName;
 if(!verifyOnly){latest=await github('/releases/latest');compareLatest(latest,m);release=await github('/releases/tags/'+tag);}
 const publicDownload='https://github.com/'+repo+'/releases/download/'+tag+'/ISLAHANDA.apk';
 const existing=release?.assets?.find(a=>a.name==='ISLAHANDA.apk');
 if(release&&!release.draft){
  if(!existing||existing.size!==m.bytes)throw Error('Published release is missing its expected APK; inspect instead of overwriting.');
  await publicBytes(publicDownload,m.bytes,m.sha256);console.log('Already published and publicly verified: '+tag);return;
 }
 const apk=await publicBytes('https://drive.usercontent.google.com/download?id='+m.apkFileId+'&export=download&confirm=t',m.bytes,m.sha256);
 const file=path.join(process.env.RUNNER_TEMP||process.cwd(),'ISLAHANDA.apk');fs.writeFileSync(file,apk);verifyAndroid(file,m);
 if(verifyOnly){console.log(JSON.stringify({verified:true,version:m.versionName,versionCode:m.versionCode,bytes:apk.length,sha256:m.sha256,signerMatched:true,packageMatched:true}));return;}
 const body='Official ISLAHANDA Android installer.\n\n'+String(m.releaseNotes||'').slice(0,4000)+'\n\nVersion code: '+m.versionCode+'\n\nSHA-256: `'+m.sha256+'`\n\n<!-- islahanda-version-code:'+m.versionCode+' -->';
 if(!release)release=await github('/releases','POST',{tag_name:tag,target_commitish:'main',name:'ISLAHANDA '+m.versionName,body,draft:true,prerelease:false});
 else if(release.body!==body)throw Error('Draft release metadata differs; inspect before resuming.');
 if(existing){if(existing.size!==m.bytes||existing.digest!=='sha256:'+m.sha256)throw Error('Draft APK differs; inspect instead of replacing it.');}
 else {
  const upload=new URL(release.upload_url.replace(/\{.*$/,''));if(upload.hostname!=='uploads.github.com'||upload.pathname!=='/repos/'+repo+'/releases/'+release.id+'/assets')throw Error('Unexpected release upload destination.');upload.searchParams.set('name','ISLAHANDA.apk');
  const r=await fetch(upload,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/vnd.android.package-archive'},body:apk,signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('GitHub APK upload failed: HTTP '+r.status);
  const asset=await r.json();if(asset.size!==m.bytes||asset.digest!=='sha256:'+m.sha256)throw Error('Uploaded release asset does not match the verified APK.');
 }
 const fresh=validateManifest(await (await fetch(manifestUrl,{signal:AbortSignal.timeout(60000)})).json());if(fresh.sha256!==m.sha256||fresh.versionCode!==m.versionCode)throw Error('Drive release advanced during verification; draft retained for review.');
 await github('/releases/'+release.id,'PATCH',{draft:false,make_latest:'true'});
 await publicBytes(publicDownload,m.bytes,m.sha256);console.log('Published and publicly verified: '+tag+' / ISLAHANDA.apk');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateManifest,compareLatest};
