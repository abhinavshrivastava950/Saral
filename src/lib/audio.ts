/** Wrap mono signed 16-bit PCM in WAV when the provider doesn't return a WAV container. */
export function pcmToWav(pcm:Uint8Array,sampleRate=24000):Uint8Array{
  if(pcm.byteLength%2)throw new Error("Invalid PCM byte length");
  const out=new Uint8Array(44+pcm.byteLength),view=new DataView(out.buffer);
  const text=(at:number,value:string)=>{for(let i=0;i<value.length;i++)out[at+i]=value.charCodeAt(i);};
  text(0,"RIFF");view.setUint32(4,36+pcm.byteLength,true);text(8,"WAVE");text(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,pcm.byteLength,true);out.set(pcm,44);return out;
}
