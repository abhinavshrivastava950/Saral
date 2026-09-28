import {z} from "zod";
import {labels,type Filing,type FieldName} from "./domain";
import {maskSensitive,profileLabels,scopeLabels} from "./chat";

export const voiceLanguageSchema=z.enum(["hi","en","auto"]);
export type VoiceLanguage=z.infer<typeof voiceLanguageSchema>;
export type DraftChange={key:string;label:string;before:string;after:string};
export const hindiFields:Record<string,string>={
  employerName:"नियोक्ता का नाम",employerTan:"नियोक्ता का टैन",annualSalary:"सालाना सकल वेतन",salaryTds:"वेतन से काटा गया टीडीएस",savingsInterest:"बचत खाते का ब्याज",depositInterest:"एफडी और आरडी का ब्याज",otherTds:"बैंक ब्याज का टीडीएस",employerNps:"नियोक्ता का एनपीएस योगदान",basicDa:"मूल वेतन और पात्र डीए",eligible80C:"धारा अस्सी सी के पात्र निवेश",eligible80D:"स्वास्थ्य बीमा की पात्र राशि",professionalTax:"पेशेवर कर",hraExemption:"मकान किराया भत्ते की छूट",name:"नाम",dateOfBirth:"जन्म तिथि",address:"पता",postalCode:"पिन कोड",bankAccount:"रिफंड का बैंक खाता",ifsc:"बैंक का आईएफएससी",resident:"भारत में निवास की स्थिति",under60:"उम्र की पात्रता",onlySalaryAndInterest:"आय के स्रोत",noSpecialCircumstances:"विशेष कर स्थितियाँ",employerType:"नियोक्ता की श्रेणी",npsIncludedInSalary:"सकल वेतन में एनपीएस शामिल होने की पुष्टि",wantsDeductions:"कटौतियों की तुलना",loans:"ऋण",loanInterest:"ऋण का सालाना ब्याज",loanNotes:"ऋण की जानकारी",additionalIncomeNotes:"अन्य आय या कटौती की जानकारी",sourceNotes:"जानकारी का स्रोत",
};
export function resolvedVoiceLanguage(language:VoiceLanguage,text=""):"hi"|"en"{
  if(language!=="auto")return language;
  return /[\u0900-\u097f]|\b(mera|meri|mujhe|hai|karo|kijiye|badal|hazar|batao)\b/i.test(text)?"hi":"en";
}
function display(value:unknown,key:string){if(value===null||value===undefined||value==="")return "Not provided";if(typeof value==="number")return new Intl.NumberFormat("en-IN",{maximumFractionDigits:2}).format(value);if(typeof value==="boolean")return value?"Yes":"No";const s=Array.isArray(value)?value.join(", "):String(value);return key==="bankAccount"||key==="pan"?maskSensitive(s):s;}
export function draftChanges(before:Filing,after:Filing):DraftChange[]{
  const result:DraftChange[]=[];
  for(const section of ["salary","scope","declarations","profile"] as const){
    const old=(section==="profile"?before.conversation?.profileDraft??{}:before[section]) as Record<string,unknown>;
    const next=(section==="profile"?after.conversation?.profileDraft??{}:after[section]) as Record<string,unknown>;
    for(const [key,value] of Object.entries(next))if(JSON.stringify(old[key])!==JSON.stringify(value)){
      const label=section==="salary"?labels[key as FieldName]:section==="scope"?scopeLabels[key as keyof Filing["scope"]]:section==="profile"?profileLabels[key as keyof typeof profileLabels]:key;
      result.push({key:`${section}.${key}`,label:label??key,before:display(old[key],key),after:display(value,key)});
    }
  }
  return result;
}
type Question={id:string;text:string}|null;
export function questionInHindi(question:Question):string{
  if(!question)return "आपका सारांश तैयार है। कोई जानकारी बदलनी हो तो बोलकर बताइए। दाखिल करने से पहले स्क्रीन पर सारांश पढ़कर मंज़ूरी दीजिए।";
  const questions:Record<string,string>={
    pan:"पहले अपना पैन नंबर बताइए। कोई पासवर्ड या ओटीपी साझा न करें।",connect:"अब आपकी अनुमति से उपलब्ध रिकॉर्ड जोड़े जाएँगे। स्क्रीन पर रिकॉर्ड जोड़ने का विकल्प चुनिए।",authorize:"रिकॉर्ड लेने के लिए प्रदाता की अनुमति पूरी कीजिए। ओटीपी या पासवर्ड इस कॉल में न बोलें।",connections_unavailable:"अभी अधिकृत रिकॉर्ड कनेक्शन उपलब्ध नहीं हैं। कोई जानकारी नहीं मँगाई गई है। आप डेमो में पूरा अनुभव देख सकते हैं।",resident:"क्या अप्रैल दो हज़ार पच्चीस से मार्च दो हज़ार छब्बीस के लिए आप भारत में निवासी और सामान्य निवासी थे?",employerType:"आप केंद्र सरकार, राज्य सरकार या किसी पीएसयू में काम करते हैं?",dateOfBirth:"आपकी जन्म तिथि रिकॉर्ड में नहीं मिली। कृपया जन्म तिथि बताइए।",under60:"क्या इस निर्धारण वर्ष के लिए आपकी उम्र अठारह से उनसठ वर्ष के बीच थी?",onlySalaryAndInterest:"वेतन और बैंक ब्याज के अलावा किराया, शेयर बिक्री, कारोबार, कृषि या विदेश से कोई आय थी?",noSpecialCircumstances:"क्या विदेशी संपत्ति, कंपनी में निदेशक होना, पुराने घाटे या स्क्रीन पर बताई गई कोई विशेष कर स्थिति लागू होती है?",npsIncludedInSalary:"क्या नियोक्ता का एनपीएस योगदान आपके बताए सकल वेतन में पहले से शामिल है?",wantsDeductions:"रिकॉर्ड में शामिल जानकारी के अलावा कोई ऋण, निवेश, बीमा या कटौती है जो आप बताना चाहेंगे?",assisted:"इस स्थिति के लिए अतिरिक्त समीक्षा चाहिए। मैं गलत रिटर्न तैयार या दाखिल नहीं करूँगा।",conflict:"रिकॉर्ड में कुछ जानकारी आपस में मेल नहीं खाती। स्क्रीन पर दिखी जानकारी का सही मूल्य और स्रोत बताइए।",validation:"एक जाँच अभी पूरी नहीं हुई है। स्क्रीन पर दिखी त्रुटि के बारे में सही जानकारी बताइए।",
    "salary.depositInterest":"आपको पूरे साल में एफडी या आरडी से कितना ब्याज मिला? जमा राशि नहीं, केवल सालाना ब्याज बताइए।",
    "salary.savingsInterest":"सभी बचत खातों से पूरे साल में कुल कितना ब्याज मिला?",
    "salary.otherTds":"बैंक ब्याज से कुल कितना टीडीएस काटा गया? यदि जाँचने पर कुछ नहीं कटा है तो शून्य बताइए।",
  };
  if(questions[question.id])return questions[question.id];
  const key=question.id.split(".").at(-1)??question.id;
  if(question.id.startsWith("confirm:"))return `मुझे ${hindiFields[key]??"इस जानकारी"} की पुष्टि चाहिए। सही जानकारी और उसका स्रोत बताइए।`;
  return `कृपया ${hindiFields[key]??"स्क्रीन पर पूछी गई जानकारी"} बताइए। मैं इसे मसौदे में भर दूँगा।`;
}
export function voiceGreeting(filing:Filing,question:Question,language:VoiceLanguage){
  const hi=language!=="en";
  const prefix=hi?"नमस्ते। मैं सरल, आपका टैक्स साथी हूँ। आप हिंदी में आराम से बोलिए। ":"Hello, I’m Saral, your tax companion. You can speak naturally. ";
  return prefix+(hi?questionInHindi(question):question?.text??"Your summary is prepared. Tell me any corrections and I’ll update the draft. Please use the on-screen buttons for final approval.");
}
export function voiceReply(before:Filing,after:Filing,question:Question,language:VoiceLanguage,utterance:string){
  const changes=draftChanges(before,after),hi=resolvedVoiceLanguage(language,utterance)==="hi";
  const last=after.conversation?.messages.at(-1)?.text??"";
  if(!hi)return {text:(changes.length?"I’ve saved your changes. "+changes.slice(0,3).map(x=>`${x.label}: ${x.after}.`).join(" "):last)+(question?" "+question.text:" You can tell me another correction. Please review the summary before filing."),changes};
  let text="";
  if(changes.length){text="ठीक है। "+changes.slice(0,3).map(x=>{
    const key=x.key.split(".")[1],value=x.after==="Yes"?"हाँ":x.after==="No"?"नहीं":x.after==="Not provided"?"अज्ञात":x.after;
    const rupees=(x.key.startsWith("salary.")&&!['employerName','employerTan'].includes(key))||x.key==="declarations.loanInterest";
    return `${hindiFields[key]??"जानकारी"} अब ${value}${rupees?" रुपये":""} दर्ज है।`;
  }).join(" ")+" मसौदा सेव हो गया है। ";if(changes.length>3)text+="बाकी बदलाव भी स्क्रीन पर दिख रहे हैं। ";}
  else if(/[\u0900-\u097f]/.test(last))text=last+" ";
  else text="आपकी मौजूदा जानकारी में कोई बदलाव नहीं किया गया है। ";
  return {text:(text+questionInHindi(question)).slice(0,2000),changes};
}
