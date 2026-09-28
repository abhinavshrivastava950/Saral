// Optional live, billable smoke test. Fictional demo data only; keys never leave the server.
const base='http://127.0.0.1:3000';let cookie='',id;
async function request(path,body,method='POST'){
  const multipart=body instanceof FormData;
  const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(!multipart?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})});
  const cookies=r.headers.getSetCookie();if(cookies.length)cookie=cookies.map(x=>x.split(';')[0]).join('; ');
  if(!r.ok){const error=await r.json();console.log(JSON.stringify({step:path.split('/').at(-1),status:r.status,code:error.code}));throw new Error('Request failed');}
  return r;
}
async function json(path,body,method){return (await request(path,body,method)).json();}
try{
  let v=await json('demo/start',{scenario:'missing-interest',consent:true});id=v.filing.id;
  v=await json(`filings/${id}/demo-fetch`,{confirmed:true,revision:v.filing.revision});
  const spoken='मेरी एफडी का सालाना ब्याज अठारह हजार रुपये है।';
  const speechResponse=await request(`filings/${id}/speech`,{text:spoken,language:'hi',aiConsent:true});
  if(speechResponse.headers.get('x-voice-provider')!=='openai')throw new Error('Wrong speech provider');
  const audio=await speechResponse.arrayBuffer();
  const form=new FormData();form.set('audio',new File([audio],'hindi-demo.wav',{type:'audio/wav'}));form.set('language','hi');form.set('aiConsent','true');
  const transcript=await json(`filings/${id}/transcribe`,form);
  if(transcript.provider!=='openai')throw new Error('Wrong transcription provider');
  console.log(JSON.stringify({step:'openai_hindi_speech_roundtrip',hindiScript:/[\u0900-\u097f]/.test(transcript.text),transcript:transcript.text}));
  v=await json(`filings/${id}/chat`,{text:transcript.text,aiConsent:true,revision:v.filing.revision,inputMode:'voice',voiceLanguage:'hi'});
  if(v.filing.salary.depositInterest!==18000||!/[\u0900-\u097f]/.test(v.voiceReply))throw new Error('Hindi fill check failed');
  console.log(JSON.stringify({step:'automatic_fill',amount:v.filing.salary.depositInterest,hindiReply:true}));
  v=await json(`filings/${id}/chat-review`,{confirmed:true,hash:v.chatReviewHash});
  v=await json(`filings/${id}/chat`,{text:'मेरी एफडी का सालाना ब्याज अठारह हजार नहीं, बाईस हजार पांच सौ रुपये है। इसे ठीक कर दीजिए।',aiConsent:true,revision:v.filing.revision,inputMode:'voice',voiceLanguage:'hi'});
  const passed=v.filing.salary.depositInterest===22500&&v.filing.status==='draft'&&v.filing.reviewHash===null&&/[\u0900-\u097f]/.test(v.voiceReply);
  console.log(JSON.stringify({step:'automatic_correction',passed,amount:v.filing.salary.depositInterest,approvalCleared:v.filing.reviewHash===null}));if(!passed)throw new Error('Correction check failed');
  v=await json(`filings/${id}/chat`,{text:'मेरी एफडी का ब्याज अब कितना दर्ज है?',aiConsent:true,revision:v.filing.revision,inputMode:'voice',voiceLanguage:'hi'});
  const spokenAnswer=v.voiceReply??'';
  const knowsLatest=/22500/.test(spokenAnswer.replace(/,/g,''))||/बाईस.*हजार.*पांच.*सौ/.test(spokenAnswer);
  console.log(JSON.stringify({step:'current_saved_state_awareness',knowsLatest,amountStill22500:v.filing.salary.depositInterest===22500}));
  if(!knowsLatest||v.filing.salary.depositInterest!==22500)throw new Error('Latest state awareness check failed');

}catch(error){console.log(JSON.stringify({ok:false,type:error.name,networkCode:error.cause?.code}));process.exitCode=1;}
finally{if(id)try{await json(`filings/${id}`,undefined,'DELETE');}catch{}}
